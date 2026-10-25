import os
import random

import pytest
from fastapi.testclient import TestClient

from solver import Job, Problem, Vehicle, solve

H = 3600


def grid_matrix(points: list[tuple[float, float]], speed: float = 1.0) -> list[list[int]]:
    """Manhattan-distance seconds between points (minutes * 60)."""
    return [[int((abs(a[0] - b[0]) + abs(a[1] - b[1])) * 60 / speed) for b in points] for a in points]


def check_routes(p: Problem, s) -> None:
    jobs = {j.id: j for j in p.jobs}
    vehicles = {v.id: v for v in p.vehicles}
    seen = set()
    for r in s.routes:
        v = vehicles[r.vehicle_id]
        assert r.load <= v.capacity
        assert sum(jobs[st.job_id].demand for st in r.stops) == r.load
        assert r.end - r.start <= v.max_duration
        assert r.start >= v.shift_start
        if v.shift_end is not None:
            assert r.end <= v.shift_end, f"{v.id} back after its shift"
        prev_node, prev_dep = v.start_node, r.start
        for st in r.stops:
            job = jobs[st.job_id]
            assert job.tw[0] <= st.arrival <= job.tw[1], f"{job.id} outside its window"
            assert st.arrival >= prev_dep + p.durations[prev_node][job.node]
            prev_node, prev_dep = job.node, st.departure
            seen.add(st.job_id)
            if job.vehicles is not None:
                assert r.vehicle_id in job.vehicles, f"{job.id} on a vehicle it isn't allowed on"
        assert r.end >= prev_dep + p.durations[prev_node][v.end_node]
    assert seen.isdisjoint(s.unassigned)
    assert seen | set(s.unassigned) == set(jobs)


def test_single_vehicle_respects_windows():
    pts = [(0, 0), (10, 0), (20, 0), (30, 0)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[
            # Window forces the far stop to be visited first.
            Job(id="far", node=3, demand=10, service=300, tw=(9 * H, 9 * H + 600)),
            Job(id="near", node=1, demand=10, service=300, tw=(9 * H, 12 * H)),
            Job(id="mid", node=2, demand=10, service=300, tw=(9 * H, 12 * H)),
        ],
        vehicles=[Vehicle(id="suv", start_node=0, end_node=0, capacity=100, shift_start=8 * H + 1800, max_duration=6 * H)],
        time_limit_seconds=2,
    )
    s = solve(p)
    check_routes(p, s)
    assert s.unassigned == []
    assert s.routes[0].stops[0].job_id == "far"


def test_capacity_splits_across_vehicles():
    pts = [(0, 0)] + [(i, i) for i in range(1, 7)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[Job(id=f"j{i}", node=i, demand=150, service=300, tw=(9 * H, 16 * H)) for i in range(1, 7)],
        vehicles=[
            Vehicle(id="a", start_node=0, end_node=0, capacity=450, shift_start=9 * H, max_duration=8 * H),
            Vehicle(id="b", start_node=0, end_node=0, capacity=450, shift_start=9 * H, max_duration=8 * H),
        ],
        time_limit_seconds=2,
    )
    s = solve(p)
    check_routes(p, s)
    assert s.unassigned == []
    assert len(s.routes) == 2


def test_drops_jobs_that_cannot_fit():
    pts = [(0, 0), (1, 0), (2, 0)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[
            Job(id="ok", node=1, demand=10, service=300, tw=(9 * H, 12 * H)),
            Job(id="too_big", node=2, demand=999, service=300, tw=(9 * H, 12 * H)),
        ],
        vehicles=[Vehicle(id="suv", start_node=0, end_node=0, capacity=400, shift_start=9 * H, max_duration=4 * H)],
        time_limit_seconds=2,
    )
    s = solve(p)
    check_routes(p, s)
    assert s.unassigned == ["too_big"]


def test_max_route_duration_is_enforced():
    pts = [(0, 0), (60, 0), (-60, 0)]  # each stop is an hour away
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[
            Job(id="east", node=1, demand=1, service=600, tw=(9 * H, 17 * H)),
            Job(id="west", node=2, demand=1, service=600, tw=(9 * H, 17 * H)),
        ],
        vehicles=[Vehicle(id="suv", start_node=0, end_node=0, capacity=400, shift_start=9 * H, max_duration=150 * 60)],
        time_limit_seconds=2,
    )
    s = solve(p)
    check_routes(p, s)
    assert len(s.unassigned) == 1


def test_random_instances_are_feasible():
    rng = random.Random(7)
    for _ in range(3):
        pts = [(0, 0)] + [(rng.uniform(-20, 20), rng.uniform(-20, 20)) for _ in range(40)]
        jobs = []
        for i in range(1, 41):
            start = rng.choice([9 * H, 13 * H])
            jobs.append(Job(id=f"j{i}", node=i, demand=rng.randint(5, 80), service=300, tw=(start, start + 3 * H)))
        p = Problem(
            durations=grid_matrix(pts),
            jobs=jobs,
            vehicles=[
                Vehicle(id=f"v{k}", start_node=0, end_node=0, capacity=400, shift_start=8 * H + 1800, max_duration=8 * H)
                for k in range(3)
            ],
            time_limit_seconds=3,
        )
        check_routes(p, solve(p))


def test_separate_start_and_end_depots():
    pts = [(0, 0), (50, 0), (10, 0), (40, 0)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[Job(id="a", node=2, demand=1, service=60, tw=(9 * H, 12 * H)), Job(id="b", node=3, demand=1, service=60, tw=(9 * H, 12 * H))],
        vehicles=[Vehicle(id="v", start_node=0, end_node=1, capacity=10, shift_start=9 * H, max_duration=4 * H)],
        time_limit_seconds=1,
    )
    s = solve(p)
    check_routes(p, s)
    assert [st.job_id for st in s.routes[0].stops] == ["a", "b"]


def test_rejects_invalid_problems():
    with pytest.raises(ValueError):
        Problem(durations=[[0, 1]], jobs=[], vehicles=[Vehicle(id="v", start_node=0, end_node=0, capacity=1, shift_start=0, max_duration=60)])
    with pytest.raises(ValueError):
        Problem(
            durations=[[0, 1], [1, 0]],
            jobs=[Job(id="a", node=0, demand=1, service=1, tw=(0, 10))],
            vehicles=[Vehicle(id="v", start_node=0, end_node=0, capacity=1, shift_start=0, max_duration=60)],
        )


def test_http_requires_secret(monkeypatch):
    monkeypatch.setenv("SOLVER_SECRET", "s3cret")
    from app import app

    client = TestClient(app)
    body = {
        "durations": [[0, 60], [60, 0]],
        "jobs": [{"id": "a", "node": 1, "demand": 1, "service": 60, "tw": [32400, 43200]}],
        "vehicles": [{"id": "v", "start_node": 0, "end_node": 0, "capacity": 10, "shift_start": 32400, "max_duration": 7200}],
        "time_limit_seconds": 1,
    }
    assert client.post("/solve", json=body).status_code == 401
    assert client.post("/solve", json=body, headers={"x-solver-secret": "nope"}).status_code == 401
    res = client.post("/solve", json=body, headers={"x-solver-secret": "s3cret"})
    assert res.status_code == 200
    assert res.json()["routes"][0]["stops"][0]["job_id"] == "a"
    assert client.get("/health").json() == {"status": "ok"}


def test_jobs_only_go_to_allowed_vehicles():
    """Two drivers with different hours: each stop must go to a driver free at that time."""
    pts = [(0, 0), (5, 0), (0, 5), (5, 5)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[
            Job(id="morning", node=1, demand=1, service=300, tw=(9 * H, 10 * H), vehicles=["am"]),
            Job(id="afternoon", node=2, demand=1, service=300, tw=(14 * H, 15 * H), vehicles=["pm"]),
            Job(id="pinned", node=3, demand=1, service=300, tw=(9 * H, 10 * H), vehicles=["am"]),
        ],
        vehicles=[
            Vehicle(id="am", start_node=0, end_node=0, capacity=10, shift_start=9 * H, shift_end=10 * H + 1800, max_duration=4 * H),
            Vehicle(id="pm", start_node=0, end_node=0, capacity=10, shift_start=14 * H, shift_end=15 * H + 1800, max_duration=4 * H),
        ],
        time_limit_seconds=2,
    )
    s = solve(p)
    check_routes(p, s)
    assert s.unassigned == []
    by_vehicle = {r.vehicle_id: {st.job_id for st in r.stops} for r in s.routes}
    assert by_vehicle == {"am": {"morning", "pinned"}, "pm": {"afternoon"}}


def test_job_with_no_allowed_vehicle_is_unassigned():
    pts = [(0, 0), (5, 0)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[Job(id="orphan", node=1, demand=1, service=60, tw=(9 * H, 10 * H), vehicles=[])],
        vehicles=[Vehicle(id="v", start_node=0, end_node=0, capacity=5, shift_start=9 * H, max_duration=2 * H)],
        time_limit_seconds=1,
    )
    assert solve(p).unassigned == ["orphan"]


def test_shift_end_limits_the_return():
    # The stop is 60 min away; the driver must be back by 10:30, so 9:00 + 2h > limit.
    pts = [(0, 0), (60, 0)]
    p = Problem(
        durations=grid_matrix(pts),
        jobs=[Job(id="far", node=1, demand=1, service=60, tw=(9 * H, 10 * H))],
        vehicles=[Vehicle(id="v", start_node=0, end_node=0, capacity=5, shift_start=9 * H, shift_end=10 * H + 1800, max_duration=4 * H)],
        time_limit_seconds=1,
    )
    assert solve(p).unassigned == ["far"]


def test_rejects_unknown_vehicle_names():
    with pytest.raises(ValueError):
        Problem(
            durations=[[0, 1], [1, 0]],
            jobs=[Job(id="a", node=1, demand=1, service=0, tw=(0, 10), vehicles=["ghost"])],
            vehicles=[Vehicle(id="v", start_node=0, end_node=0, capacity=1, shift_start=0, max_duration=100)],
        )
