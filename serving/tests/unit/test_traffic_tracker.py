import pytest

from app.traffic.tracker import Box, Observation, StreamStatistics, Tracker, iou


def car(x: float, label: str = "car", confidence: float = 0.9) -> Observation:
    return Observation(label, confidence, (x, 0.4, x + 0.2, 0.6))


def started(tracker: Tracker) -> Tracker:
    """A tracker past its first frame (an empty road), so new objects are counted."""
    tracker.update([])
    return tracker


def test_iou() -> None:
    box: Box = (0.0, 0.0, 0.2, 0.2)
    assert iou(box, box) == pytest.approx(1.0)
    assert iou(box, (0.1, 0.0, 0.3, 0.2)) == pytest.approx(1 / 3)
    assert iou(box, (0.2, 0.0, 0.4, 0.2)) == 0.0  # touching edges do not overlap


def test_a_moving_object_keeps_its_identity_and_is_counted_once() -> None:
    tracker = started(Tracker(iou_threshold=0.3, max_missed=2, min_hits=3))
    counted: list[str] = []
    seen: list[list[int]] = []
    for step in range(6):
        visible, confirmed = tracker.update([car(0.1 + 0.03 * step)])
        counted += confirmed
        seen.append([track.id for track in visible])

    # Hidden for the first two frames (it could be a false detection), then stable.
    assert seen == [[], [], [1], [1], [1], [1]]
    assert counted == ["car"]


def test_counting_can_wait_longer_than_showing() -> None:
    tracker = started(Tracker(min_hits=2, count_hits=4))
    results = [tracker.update([car(0.1)]) for _ in range(5)]

    assert [len(visible) for visible, _ in results] == [0, 1, 1, 1, 1]
    assert [confirmed for _, confirmed in results] == [[], [], [], ["car"], []]


def test_two_objects_are_told_apart() -> None:
    tracker = Tracker(min_hits=1)
    tracker.update([car(0.1), car(0.6)])
    # Reported in the other order in the next frame.
    visible, _ = tracker.update([car(0.62), car(0.12)])

    assert {track.id: track.box[0] for track in visible} == {1: 0.12, 2: 0.62}


def test_a_short_gap_does_not_create_a_new_object() -> None:
    tracker = started(Tracker(max_missed=2, min_hits=1))
    counted = tracker.update([car(0.1)])[1]
    visible, confirmed = tracker.update([])  # missed in one frame
    assert visible == []
    counted += confirmed
    visible, confirmed = tracker.update([car(0.12)])
    counted += confirmed

    assert [track.id for track in visible] == [1]
    assert counted == ["car"]


def test_an_object_that_stays_away_is_forgotten() -> None:
    tracker = Tracker(max_missed=1, min_hits=1)
    tracker.update([car(0.1)])
    tracker.update([])
    tracker.update([])
    visible, confirmed = tracker.update([car(0.1)])

    assert [track.id for track in visible] == [2]
    assert confirmed == ["car"]


def test_objects_in_view_when_tracking_starts_are_shown_but_not_counted() -> None:
    tracker = Tracker(min_hits=1, count_hits=2)
    counted: list[str] = []
    for step in range(4):
        # The bus is there from the start; the car arrives in the second frame.
        observations = [car(0.6, "bus")] + ([car(0.1 + 0.02 * step)] if step else [])
        visible, confirmed = tracker.update(observations)
        counted += confirmed
    assert sorted(track.label for track in visible) == ["bus", "car"]
    assert counted == ["car"]

    tracker.reset()  # the video jumped: what is in view now arrived unseen
    _, confirmed = tracker.update([car(0.3)])
    _, confirmed_next = tracker.update([car(0.31)])
    assert confirmed + confirmed_next == []


def test_the_class_with_the_most_support_wins() -> None:
    tracker = Tracker(min_hits=1)
    tracker.update([car(0.1, "truck", 0.5)])
    tracker.update([car(0.1, "car", 0.9)])
    visible, _ = tracker.update([car(0.1, "truck", 0.3)])

    assert visible[0].label == "car"  # 0.9 against 0.5 + 0.3


def test_reset_drops_objects_but_never_reuses_identifiers() -> None:
    tracker = Tracker(min_hits=1)
    tracker.update([car(0.1)])
    tracker.reset()
    visible, _ = tracker.update([car(0.1)])

    assert [track.id for track in visible] == [2]


def test_statistics_use_sliding_windows() -> None:
    stats = StreamStatistics()
    stats.frame(100.0, 0.02, ["car", "bus"])
    stats.frame(100.2, 0.04, [])
    stats.frame(100.4, 0.03, ["car"])

    assert stats.counted == {"car": 2, "bus": 1}
    assert stats.per_minute == 3
    assert stats.analysis_fps == pytest.approx(5.0)
    assert stats.inference_ms == pytest.approx(30.0)

    stats.frame(161.0, 0.05, [])  # more than a minute later
    assert stats.counted == {"car": 2, "bus": 1}  # totals stay
    assert stats.per_minute == 0
    assert stats.analysis_fps == 0.0
    assert stats.inference_ms == pytest.approx(50.0)


def test_rates_per_class_over_the_last_minute_and_on_average() -> None:
    stats = StreamStatistics()
    now = 100.0
    # Two minutes of analysis at 5 frames per second: a car every 2 s, a bus every 10 s.
    for step in range(600):
        now = 100.0 + step * 0.2
        confirmed = (["car"] if step % 10 == 0 else []) + (["bus"] if step % 50 == 0 else [])
        stats.frame(now, 0.01, confirmed, in_view=2)

    assert stats.analysis_seconds == pytest.approx(119.8)
    assert stats.per_minute_by_class == {"car": 30, "bus": 6}
    average = stats.average_per_minute
    assert average["car"] == pytest.approx(60 / (119.8 / 60))
    assert average["bus"] == pytest.approx(12 / (119.8 / 60))


def test_averages_wait_for_a_minute_and_ignore_pauses() -> None:
    stats = StreamStatistics()
    for step in range(100):  # 19.8 s of analysis
        stats.frame(100.0 + step * 0.2, 0.01, ["car"] if step == 0 else [])
    assert stats.average_per_minute == {}

    # Nobody watched for an hour; the analysis resumes for another 50 s.
    for step in range(251):
        stats.frame(4000.0 + step * 0.2, 0.01, [])
    assert stats.analysis_seconds == pytest.approx(19.8 + 50.0)
    assert stats.average_per_minute["car"] == pytest.approx(1 / (69.8 / 60))


def test_trend_buckets_follow_analysis_time() -> None:
    stats = StreamStatistics(trend_bucket_seconds=10.0, trend_buckets=3)
    stats.frame(100.0, 0.01, ["car"])
    stats.frame(105.0, 0.01, ["car", "bus"])  # 5 s later: a pause, no analysis time passed
    assert stats.trend == [3]

    # 15 s more at 5 frames per second; one car at 8 s, one at 12 s of analysis time.
    for step in range(1, 76):
        stats.frame(105.0 + step * 0.2, 0.01, ["car"] if step in (40, 60) else [])
    assert stats.analysis_seconds == pytest.approx(15.0)
    assert stats.trend == [4, 1]

    for step in range(76, 251):  # 35 s more: only the newest three buckets are kept
        stats.frame(105.0 + step * 0.2, 0.01, [])
    assert stats.trend == [0, 0, 0]


def congestion(stats: StreamStatistics) -> str | None:
    # Read through a call: mypy would otherwise keep the property narrowed between asserts.
    return stats.congestion


def test_occupancy_and_congestion_against_the_streams_own_normal() -> None:
    stats = StreamStatistics(congestion_thresholds=(0.8, 1.25), congestion_min_seconds=120.0)
    now = 0.0
    for step in range(900):  # three minutes with 2 objects in view
        now = step * 0.2
        stats.frame(now, 0.01, [], in_view=2)
        if step == 300:
            assert congestion(stats) is None  # one minute is not enough to know "normal"
    assert stats.occupancy_mean == pytest.approx(2.0)
    assert congestion(stats) == "moderate"

    for step in range(1, 301):  # a busy minute: 6 in view, peak 9
        stats.frame(now + step * 0.2, 0.01, [], in_view=9 if step == 150 else 6)
    assert stats.occupancy_peak == 9
    assert stats.occupancy_mean > 5.9
    assert congestion(stats) == "high"


def test_an_empty_road_is_not_congested() -> None:
    stats = StreamStatistics(congestion_min_seconds=0.0)
    stats.frame(0.0, 0.01, [], in_view=0)
    assert stats.congestion == "low"
