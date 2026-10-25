"""Vehicle routing with time windows, capacity and max route duration (OR-Tools).

The caller supplies a travel-time matrix between "nodes" (depots and pickup
locations); the solver never sees addresses. Times are seconds since midnight.
"""

from __future__ import annotations

from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field, model_validator

# Dropping a job is allowed (it is reported as unassigned) but costs far more
# than any route, so the solver only does it when a job can't fit.
DROP_PENALTY = 10_000_000
MAX_WAIT = 4 * 3600


class Job(BaseModel):
    id: str
    node: int = Field(ge=0)
    demand: int = Field(ge=0)
    service: int = Field(ge=0)
    tw: tuple[int, int]
    # Vehicles allowed to serve this job (None = any). Used for driver
    # availability (only drivers free at that hour) and admin assignments.
    vehicles: list[str] | None = None


class Vehicle(BaseModel):
    id: str
    start_node: int = Field(ge=0)
    end_node: int = Field(ge=0)
    capacity: int = Field(gt=0)
    shift_start: int = Field(ge=0)
    max_duration: int = Field(gt=0)
    # Latest time the vehicle may be back at its end depot (None = no limit).
    shift_end: int | None = Field(default=None, ge=0)


class Problem(BaseModel):
    durations: list[list[int]]
    jobs: list[Job]
    vehicles: list[Vehicle] = Field(min_length=1)
    time_limit_seconds: int = Field(default=10, ge=1, le=60)

    @model_validator(mode="after")
    def _check(self) -> "Problem":
        n = len(self.durations)
        if n == 0 or any(len(row) != n for row in self.durations):
            raise ValueError("durations must be a square matrix")
        for j in self.jobs:
            if j.node >= n:
                raise ValueError(f"job {j.id} node out of range")
            if j.tw[0] > j.tw[1]:
                raise ValueError(f"job {j.id} has an empty time window")
        vehicle_ids = {v.id for v in self.vehicles}
        if len(vehicle_ids) != len(self.vehicles):
            raise ValueError("vehicle ids must be unique")
        for j in self.jobs:
            if j.vehicles is not None and not set(j.vehicles) <= vehicle_ids:
                raise ValueError(f"job {j.id} names an unknown vehicle")
        depot_nodes = set()
        for v in self.vehicles:
            if v.shift_end is not None and v.shift_end < v.shift_start:
                raise ValueError(f"vehicle {v.id} ends before it starts")
            if v.start_node >= n or v.end_node >= n:
                raise ValueError(f"vehicle {v.id} node out of range")
            depot_nodes |= {v.start_node, v.end_node}
        job_nodes = [j.node for j in self.jobs]
        if len(set(job_nodes)) != len(job_nodes) or depot_nodes & set(job_nodes):
            raise ValueError("each job needs its own node, distinct from depots")
        return self


class Stop(BaseModel):
    job_id: str
    arrival: int  # time service starts
    departure: int


class Route(BaseModel):
    vehicle_id: str
    start: int
    end: int
    load: int
    stops: list[Stop]


class Solution(BaseModel):
    status: str
    routes: list[Route]
    unassigned: list[str]


def solve(p: Problem) -> Solution:
    if not p.jobs:
        return Solution(status="optimal", routes=[], unassigned=[])

    # OR-Tools nodes: 0..len(jobs)-1 are jobs, then one node per distinct depot.
    depot_matrix_nodes = sorted({v.start_node for v in p.vehicles} | {v.end_node for v in p.vehicles})
    matrix_node = [j.node for j in p.jobs] + depot_matrix_nodes
    depot_index = {m: len(p.jobs) + i for i, m in enumerate(depot_matrix_nodes)}
    service = [j.service for j in p.jobs] + [0] * len(depot_matrix_nodes)
    demand = [j.demand for j in p.jobs] + [0] * len(depot_matrix_nodes)

    manager = pywrapcp.RoutingIndexManager(
        len(matrix_node),
        len(p.vehicles),
        [depot_index[v.start_node] for v in p.vehicles],
        [depot_index[v.end_node] for v in p.vehicles],
    )
    routing = pywrapcp.RoutingModel(manager)

    def travel(i: int, j: int) -> int:
        a, b = manager.IndexToNode(i), manager.IndexToNode(j)
        return p.durations[matrix_node[a]][matrix_node[b]]

    def transit(i: int, j: int) -> int:
        return travel(i, j) + service[manager.IndexToNode(i)]

    travel_cb = routing.RegisterTransitCallback(travel)
    transit_cb = routing.RegisterTransitCallback(transit)
    routing.SetArcCostEvaluatorOfAllVehicles(travel_cb)

    horizon = max(
        [j.tw[1] + j.service for j in p.jobs]
        + [v.shift_start + v.max_duration for v in p.vehicles]
        + [v.shift_end or 0 for v in p.vehicles]
    ) + 3600
    routing.AddDimension(transit_cb, MAX_WAIT, horizon, False, "Time")
    time = routing.GetDimensionOrDie("Time")

    vehicle_index = {v.id: i for i, v in enumerate(p.vehicles)}
    for k, job in enumerate(p.jobs):
        idx = manager.NodeToIndex(k)
        time.CumulVar(idx).SetRange(job.tw[0], job.tw[1])
        routing.AddDisjunction([idx], DROP_PENALTY)
        if job.vehicles is not None:
            # -1 = "not performed", so a job with no allowed vehicle is simply dropped.
            routing.VehicleVar(idx).SetValues([-1] + [vehicle_index[v] for v in job.vehicles])

    for v_i, v in enumerate(p.vehicles):
        start = routing.Start(v_i)
        latest_start = v.shift_start + MAX_WAIT
        if v.shift_end is not None:
            latest_start = min(latest_start, v.shift_end)
            time.CumulVar(routing.End(v_i)).SetMax(v.shift_end)
        time.CumulVar(start).SetRange(v.shift_start, latest_start)
        time.SetSpanUpperBoundForVehicle(v.max_duration, v_i)
        routing.AddVariableMinimizedByFinalizer(time.CumulVar(start))
        routing.AddVariableMinimizedByFinalizer(time.CumulVar(routing.End(v_i)))
    # Prefer shorter working days (less idle waiting) after travel time.
    time.SetSpanCostCoefficientForAllVehicles(1)

    demand_cb = routing.RegisterUnaryTransitCallback(lambda i: demand[manager.IndexToNode(i)])
    routing.AddDimensionWithVehicleCapacity(
        demand_cb, 0, [v.capacity for v in p.vehicles], True, "Capacity"
    )

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = p.time_limit_seconds

    solution = routing.SolveWithParameters(params)
    if solution is None:
        return Solution(status="no_solution", routes=[], unassigned=[j.id for j in p.jobs])

    routes: list[Route] = []
    visited: set[str] = set()
    for v_i, v in enumerate(p.vehicles):
        idx = routing.Start(v_i)
        start_time = solution.Min(time.CumulVar(idx))
        stops: list[Stop] = []
        load = 0
        idx = solution.Value(routing.NextVar(idx))
        while not routing.IsEnd(idx):
            k = manager.IndexToNode(idx)
            job = p.jobs[k]
            arrival = solution.Min(time.CumulVar(idx))
            stops.append(Stop(job_id=job.id, arrival=arrival, departure=arrival + job.service))
            visited.add(job.id)
            load += job.demand
            idx = solution.Value(routing.NextVar(idx))
        if stops:
            routes.append(
                Route(
                    vehicle_id=v.id,
                    start=start_time,
                    end=solution.Min(time.CumulVar(idx)),
                    load=load,
                    stops=stops,
                )
            )

    optimal = routing.status() == routing_enums_pb2.RoutingSearchStatus.ROUTING_OPTIMAL
    status = "optimal" if optimal else "feasible"
    return Solution(
        status=status, routes=routes, unassigned=[j.id for j in p.jobs if j.id not in visited]
    )
