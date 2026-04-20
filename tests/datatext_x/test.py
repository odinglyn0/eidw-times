import pytest
from text import generate_tweet


class TestCriticalScenarios:
    def test_both_terminals_critical(self):
        tweet = generate_tweet(
            t1_last_hour=50,
            t1_now=60,
            t1_next_hour=70,
            t1_in_2_hours=80,
            t1_in_3_hours=90,
            t2_last_hour=45,
            t2_now=55,
            t2_next_hour=65,
            t2_in_2_hours=70,
            t2_in_3_hours=75,
        )
        assert "⚠️" in tweet
        assert "Long queues" in tweet
        assert "T1" in tweet and "T2" in tweet

    def test_both_critical_recommends_shorter(self):
        tweet = generate_tweet(
            t1_last_hour=50,
            t1_now=50,
            t1_next_hour=55,
            t1_in_2_hours=60,
            t1_in_3_hours=65,
            t2_last_hour=50,
            t2_now=70,
            t2_next_hour=75,
            t2_in_2_hours=80,
            t2_in_3_hours=85,
        )
        assert "T1 is shorter" in tweet or "If you can choose" in tweet

    def test_only_t1_critical(self):
        tweet = generate_tweet(
            t1_last_hour=40,
            t1_now=50,
            t1_next_hour=55,
            t1_in_2_hours=60,
            t1_in_3_hours=50,
            t2_last_hour=5,
            t2_now=8,
            t2_next_hour=10,
            t2_in_2_hours=9,
            t2_in_3_hours=8,
        )
        assert "⚠️" in tweet
        assert "Terminal 1" in tweet
        assert "calmer" in tweet

    def test_only_t2_critical(self):
        tweet = generate_tweet(
            t1_last_hour=5,
            t1_now=8,
            t1_next_hour=10,
            t1_in_2_hours=9,
            t1_in_3_hours=8,
            t2_last_hour=40,
            t2_now=50,
            t2_next_hour=55,
            t2_in_2_hours=60,
            t2_in_3_hours=50,
        )
        assert "⚠️" in tweet
        assert "Terminal 2" in tweet
        assert "calmer" in tweet


class TestGreatScenarios:
    def test_both_great(self):
        tweet = generate_tweet(
            t1_last_hour=3,
            t1_now=3,
            t1_next_hour=4,
            t1_in_2_hours=3,
            t1_in_3_hours=4,
            t2_last_hour=3,
            t2_now=3,
            t2_next_hour=3,
            t2_in_2_hours=4,
            t2_in_3_hours=3,
        )
        assert "🟢" in tweet
        assert "Great news" in tweet or "flying through" in tweet

    def test_great_shows_both_terminals(self):
        tweet = generate_tweet(
            t1_last_hour=2,
            t1_now=2,
            t1_next_hour=3,
            t1_in_2_hours=2,
            t1_in_3_hours=3,
            t2_last_hour=4,
            t2_now=5,
            t2_next_hour=5,
            t2_in_2_hours=6,
            t2_in_3_hours=5,
        )
        assert "T1" in tweet and "T2" in tweet


class TestAllFlatScenarios:
    def test_flat_same_now(self):
        tweet = generate_tweet(
            t1_last_hour=8,
            t1_now=8,
            t1_next_hour=8,
            t1_in_2_hours=8,
            t1_in_3_hours=8,
            t2_last_hour=8,
            t2_now=8,
            t2_next_hour=8,
            t2_in_2_hours=8,
            t2_in_3_hours=8,
        )
        assert "stable" in tweet.lower() or "steady" in tweet.lower()

    def test_flat_different_now(self):
        tweet = generate_tweet(
            t1_last_hour=8,
            t1_now=8,
            t1_next_hour=8,
            t1_in_2_hours=8,
            t1_in_3_hours=8,
            t2_last_hour=7,
            t2_now=7,
            t2_next_hour=7,
            t2_in_2_hours=7,
            t2_in_3_hours=7,
        )
        assert "no significant changes" in tweet.lower() or "steady" in tweet.lower()


class TestDivergingScenarios:
    def test_t1_rising_t2_falling(self):
        tweet = generate_tweet(
            t1_last_hour=15,
            t1_now=20,
            t1_next_hour=25,
            t1_in_2_hours=30,
            t1_in_3_hours=35,
            t2_last_hour=35,
            t2_now=30,
            t2_next_hour=25,
            t2_in_2_hours=20,
            t2_in_3_hours=15,
        )
        assert "opposite" in tweet.lower() or "diverging" in tweet.lower()

    def test_t1_falling_t2_rising(self):
        tweet = generate_tweet(
            t1_last_hour=35,
            t1_now=30,
            t1_next_hour=25,
            t1_in_2_hours=20,
            t1_in_3_hours=15,
            t2_last_hour=15,
            t2_now=20,
            t2_next_hour=25,
            t2_in_2_hours=30,
            t2_in_3_hours=35,
        )
        assert "diverging" in tweet.lower() or "T1" in tweet


class TestSpikeThenDropScenarios:
    def test_both_spike_then_drop(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=15,
            t1_next_hour=30,
            t1_in_2_hours=15,
            t1_in_3_hours=10,
            t2_last_hour=10,
            t2_now=14,
            t2_next_hour=28,
            t2_in_2_hours=14,
            t2_in_3_hours=9,
        )
        assert "⚠️" in tweet
        assert "peaking" in tweet.lower() or "busy" in tweet.lower()

    def test_only_t1_spike(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=12,
            t1_next_hour=30,
            t1_in_2_hours=15,
            t1_in_3_hours=13,
            t2_last_hour=10,
            t2_now=10,
            t2_next_hour=10,
            t2_in_2_hours=10,
            t2_in_3_hours=10,
        )
        assert "T1" in tweet
        assert "spike" in tweet.lower() or "⚠️" in tweet

    def test_only_t2_spike(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=10,
            t1_next_hour=10,
            t1_in_2_hours=10,
            t1_in_3_hours=10,
            t2_last_hour=10,
            t2_now=12,
            t2_next_hour=30,
            t2_in_2_hours=15,
            t2_in_3_hours=13,
        )
        assert "T2" in tweet
        assert "spike" in tweet.lower() or "⚠️" in tweet


class TestMonotoneTrends:
    def test_both_monotone_up_significant(self):
        tweet = generate_tweet(
            t1_last_hour=8,
            t1_now=10,
            t1_next_hour=15,
            t1_in_2_hours=20,
            t1_in_3_hours=25,
            t2_last_hour=8,
            t2_now=10,
            t2_next_hour=14,
            t2_in_2_hours=18,
            t2_in_3_hours=22,
        )
        assert "📈" in tweet
        assert "climbing" in tweet.lower() or "rising" in tweet.lower()

    def test_both_monotone_down_significant(self):
        tweet = generate_tweet(
            t1_last_hour=30,
            t1_now=25,
            t1_next_hour=20,
            t1_in_2_hours=15,
            t1_in_3_hours=10,
            t2_last_hour=28,
            t2_now=22,
            t2_next_hour=18,
            t2_in_2_hours=14,
            t2_in_3_hours=10,
        )
        assert "📉" in tweet
        assert "easing" in tweet.lower() or "down" in tweet.lower()

    def test_t1_up_t2_down(self):
        tweet = generate_tweet(
            t1_last_hour=5,
            t1_now=5,
            t1_next_hour=10,
            t1_in_2_hours=15,
            t1_in_3_hours=20,
            t2_last_hour=30,
            t2_now=25,
            t2_next_hour=20,
            t2_in_2_hours=15,
            t2_in_3_hours=10,
        )
        assert "T1" in tweet and "T2" in tweet

    def test_t2_up_t1_down(self):
        tweet = generate_tweet(
            t1_last_hour=30,
            t1_now=25,
            t1_next_hour=20,
            t1_in_2_hours=15,
            t1_in_3_hours=10,
            t2_last_hour=5,
            t2_now=5,
            t2_next_hour=10,
            t2_in_2_hours=15,
            t2_in_3_hours=20,
        )
        assert "T2" in tweet
        assert "rising" in tweet.lower() or "📈" in tweet

    def test_t1_monotone_down_t2_mixed(self):
        tweet = generate_tweet(
            t1_last_hour=30,
            t1_now=25,
            t1_next_hour=20,
            t1_in_2_hours=15,
            t1_in_3_hours=10,
            t2_last_hour=10,
            t2_now=12,
            t2_next_hour=20,
            t2_in_2_hours=15,
            t2_in_3_hours=18,
        )
        assert "T1" in tweet
        assert "easing" in tweet.lower() or "📉" in tweet

    def test_t2_monotone_down_t1_mixed(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=12,
            t1_next_hour=20,
            t1_in_2_hours=15,
            t1_in_3_hours=18,
            t2_last_hour=30,
            t2_now=25,
            t2_next_hour=20,
            t2_in_2_hours=15,
            t2_in_3_hours=10,
        )
        assert "T2" in tweet
        assert "easing" in tweet.lower() or "📉" in tweet


class TestFallbackBranch:
    def test_significant_t1_change_leads(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=10,
            t1_next_hour=12,
            t1_in_2_hours=18,
            t1_in_3_hours=15,
            t2_last_hour=10,
            t2_now=10,
            t2_next_hour=11,
            t2_in_2_hours=11,
            t2_in_3_hours=11,
        )
        assert "T1" in tweet
        assert "Dublin Airport" in tweet

    def test_significant_t2_change_leads(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=10,
            t1_next_hour=11,
            t1_in_2_hours=11,
            t1_in_3_hours=11,
            t2_last_hour=10,
            t2_now=10,
            t2_next_hour=12,
            t2_in_2_hours=18,
            t2_in_3_hours=15,
        )
        assert "T2" in tweet
        assert "Dublin Airport" in tweet

    def test_no_significant_changes_fallback(self):
        tweet = generate_tweet(
            t1_last_hour=30,
            t1_now=30,
            t1_next_hour=31,
            t1_in_2_hours=30,
            t1_in_3_hours=31,
            t2_last_hour=30,
            t2_now=30,
            t2_next_hour=31,
            t2_in_2_hours=30,
            t2_in_3_hours=31,
        )
        assert (
            "stable" in tweet.lower()
            or "steady" in tweet.lower()
            or "no major" in tweet.lower()
        )


class TestPastSurgeAnnotation:
    def test_t1_past_surge(self):
        tweet = generate_tweet(
            t1_last_hour=12,
            t1_now=20,
            t1_next_hour=25,
            t1_in_2_hours=30,
            t1_in_3_hours=35,
            t2_last_hour=10,
            t2_now=10,
            t2_next_hour=11,
            t2_in_2_hours=12,
            t2_in_3_hours=13,
        )
        assert "T1 has already jumped" in tweet

    def test_t2_past_surge(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=10,
            t1_next_hour=11,
            t1_in_2_hours=12,
            t1_in_3_hours=13,
            t2_last_hour=12,
            t2_now=20,
            t2_next_hour=25,
            t2_in_2_hours=30,
            t2_in_3_hours=35,
        )
        assert "T2 has already jumped" in tweet

    def test_both_past_surge(self):
        tweet = generate_tweet(
            t1_last_hour=12,
            t1_now=20,
            t1_next_hour=25,
            t1_in_2_hours=30,
            t1_in_3_hours=35,
            t2_last_hour=12,
            t2_now=20,
            t2_next_hour=25,
            t2_in_2_hours=30,
            t2_in_3_hours=35,
        )
        assert "Both terminals have already surged" in tweet

    def test_no_past_surge_when_low(self):
        tweet = generate_tweet(
            t1_last_hour=5,
            t1_now=8,
            t1_next_hour=10,
            t1_in_2_hours=12,
            t1_in_3_hours=14,
            t2_last_hour=5,
            t2_now=8,
            t2_next_hour=10,
            t2_in_2_hours=12,
            t2_in_3_hours=14,
        )
        assert "jumped" not in tweet and "surged" not in tweet


class TestConvergingAnnotation:
    def test_converging_annotation(self):
        tweet = generate_tweet(
            t1_last_hour=15,
            t1_now=20,
            t1_next_hour=22,
            t1_in_2_hours=24,
            t1_in_3_hours=26,
            t2_last_hour=35,
            t2_now=30,
            t2_next_hour=29,
            t2_in_2_hours=28,
            t2_in_3_hours=27,
        )
        assert "converging" in tweet.lower() or "gap" in tweet.lower()


class TestGapRecommendation:
    def test_gap_recommendation_added(self):
        tweet = generate_tweet(
            t1_last_hour=8,
            t1_now=8,
            t1_next_hour=8,
            t1_in_2_hours=9,
            t1_in_3_hours=8,
            t2_last_hour=20,
            t2_now=20,
            t2_next_hour=20,
            t2_in_2_hours=21,
            t2_in_3_hours=20,
        )
        assert "quicker option" in tweet.lower()


class TestTweetLength:
    def test_max_length_280(self):
        tweet = generate_tweet(
            t1_last_hour=10,
            t1_now=50,
            t1_next_hour=100,
            t1_in_2_hours=80,
            t1_in_3_hours=60,
            t2_last_hour=10,
            t2_now=55,
            t2_next_hour=110,
            t2_in_2_hours=90,
            t2_in_3_hours=70,
        )
        assert len(tweet) <= 280

    def test_length_with_all_annotations(self):
        tweet = generate_tweet(
            t1_last_hour=12,
            t1_now=20,
            t1_next_hour=25,
            t1_in_2_hours=30,
            t1_in_3_hours=35,
            t2_last_hour=12,
            t2_now=20,
            t2_next_hour=25,
            t2_in_2_hours=30,
            t2_in_3_hours=35,
        )
        assert len(tweet) <= 280


class TestReturnType:
    def test_returns_string(self):
        result = generate_tweet(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
        assert isinstance(result, str)

    def test_returns_non_empty(self):
        result = generate_tweet(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
        assert len(result) > 0


class TestEdgeCases:
    def test_zero_now_values(self):
        tweet = generate_tweet(
            t1_last_hour=0,
            t1_now=0,
            t1_next_hour=5,
            t1_in_2_hours=10,
            t1_in_3_hours=15,
            t2_last_hour=0,
            t2_now=0,
            t2_next_hour=5,
            t2_in_2_hours=10,
            t2_in_3_hours=15,
        )
        assert isinstance(tweet, str)

    def test_all_identical_values(self):
        tweet = generate_tweet(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
        assert "Dublin Airport" in tweet

    def test_single_minute_formatting(self):
        tweet = generate_tweet(
            t1_last_hour=1,
            t1_now=1,
            t1_next_hour=1,
            t1_in_2_hours=1,
            t1_in_3_hours=1,
            t2_last_hour=1,
            t2_now=1,
            t2_next_hour=1,
            t2_in_2_hours=1,
            t2_in_3_hours=1,
        )
        assert "1 min" in tweet
        assert "1 mins" not in tweet

    def test_plural_minute_formatting(self):
        tweet = generate_tweet(
            t1_last_hour=5,
            t1_now=5,
            t1_next_hour=5,
            t1_in_2_hours=5,
            t1_in_3_hours=5,
            t2_last_hour=5,
            t2_now=5,
            t2_next_hour=5,
            t2_in_2_hours=5,
            t2_in_3_hours=5,
        )
        assert "5 mins" in tweet

    def test_very_large_values(self):
        tweet = generate_tweet(
            t1_last_hour=200,
            t1_now=300,
            t1_next_hour=400,
            t1_in_2_hours=500,
            t1_in_3_hours=600,
            t2_last_hour=200,
            t2_now=300,
            t2_next_hour=400,
            t2_in_2_hours=500,
            t2_in_3_hours=600,
        )
        assert len(tweet) <= 280
        assert isinstance(tweet, str)


class TestExamplesFromMain:
    examples = [
        (10, 12, 20, 35, 30, 8, 9, 10, 11, 12),
        (5, 4, 3, 2, 2, 5, 4, 3, 3, 2),
        (8, 8, 8, 9, 8, 7, 7, 8, 7, 7),
        (20, 30, 50, 45, 35, 10, 12, 10, 8, 7),
        (60, 70, 80, 85, 90, 55, 60, 70, 75, 80),
        (3, 3, 4, 3, 4, 3, 3, 3, 4, 3),
        (10, 15, 30, 15, 10, 10, 14, 28, 14, 9),
        (5, 5, 5, 5, 5, 30, 25, 20, 15, 10),
        (40, 50, 30, 20, 15, 10, 12, 40, 60, 70),
        (15, 20, 25, 30, 35, 35, 30, 25, 20, 15),
    ]

    @pytest.mark.parametrize("args", examples)
    def test_example_produces_valid_tweet(self, args):
        tweet = generate_tweet(*args)
        assert isinstance(tweet, str)
        assert len(tweet) > 0
        assert len(tweet) <= 280
        assert "Dublin Airport" in tweet
