import pytest
from text import generate_tweet


class TestCriticalScenarios:
    def test_both_terminals_critical(self):
        tweet = generate_tweet(50, 60, 70, 80, 90, 45, 55, 65, 70, 75)
        assert "⚠️" in tweet
        assert "T1" in tweet and "T2" in tweet

    def test_both_critical_recommends_shorter(self):
        tweet = generate_tweet(50, 50, 55, 60, 65, 50, 70, 75, 80, 85)
        assert "T1" in tweet and "shorter" in tweet

    def test_only_t1_critical(self):
        tweet = generate_tweet(40, 50, 55, 60, 50, 5, 8, 10, 9, 8)
        assert "⚠️" in tweet
        assert "T1" in tweet
        assert "T2" in tweet

    def test_only_t2_critical(self):
        tweet = generate_tweet(5, 8, 10, 9, 8, 40, 50, 55, 60, 50)
        assert "⚠️" in tweet
        assert "T2" in tweet


class TestGreatScenarios:
    def test_both_great(self):
        tweet = generate_tweet(3, 3, 4, 3, 4, 3, 3, 3, 4, 3)
        assert "🟢" in tweet

    def test_great_shows_both_terminals(self):
        tweet = generate_tweet(2, 2, 3, 2, 3, 4, 5, 5, 6, 5)
        assert "T1" in tweet and "T2" in tweet


class TestFlatScenarios:
    def test_flat_stable(self):
        tweet = generate_tweet(8, 8, 8, 8, 8, 8, 8, 8, 8, 8)
        assert "steady" in tweet.lower() or "update" in tweet.lower()

    def test_flat_different(self):
        tweet = generate_tweet(8, 8, 8, 8, 8, 7, 7, 7, 7, 7)
        assert "T1" in tweet and "T2" in tweet


class TestMonotoneTrends:
    def test_both_rising(self):
        tweet = generate_tweet(8, 10, 15, 20, 25, 8, 10, 14, 18, 22)
        assert "📈" in tweet or "rising" in tweet.lower()

    def test_both_falling(self):
        tweet = generate_tweet(30, 25, 20, 15, 10, 28, 22, 18, 14, 10)
        assert "📉" in tweet or "clearing" in tweet.lower()

    def test_t1_up_t2_down(self):
        tweet = generate_tweet(5, 5, 10, 15, 20, 30, 25, 20, 15, 10)
        assert "T1" in tweet and "T2" in tweet

    def test_t2_up_t1_down(self):
        tweet = generate_tweet(30, 25, 20, 15, 10, 5, 5, 10, 15, 20)
        assert "T1" in tweet and "T2" in tweet


class TestFallback:
    def test_mixed_scenario(self):
        tweet = generate_tweet(10, 10, 12, 18, 15, 10, 10, 11, 11, 11)
        assert "DUB" in tweet or "T1" in tweet

    def test_gap_recommendation(self):
        tweet = generate_tweet(8, 8, 9, 10, 9, 20, 20, 22, 18, 19)
        assert "quicker" in tweet.lower() or "T1" in tweet


class TestTweetLength:
    def test_max_length(self):
        tweet = generate_tweet(10, 50, 100, 80, 60, 10, 55, 110, 90, 70)
        assert len(tweet) <= 270

    @pytest.mark.parametrize(
        "args",
        [
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
        ],
    )
    def test_all_examples_under_limit(self, args):
        tweet = generate_tweet(*args)
        assert isinstance(tweet, str)
        assert len(tweet) > 0
        assert len(tweet) <= 270


class TestEdgeCases:
    def test_zero_values(self):
        tweet = generate_tweet(0, 0, 5, 10, 15, 0, 0, 5, 10, 15)
        assert isinstance(tweet, str)

    def test_identical_values(self):
        tweet = generate_tweet(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
        assert isinstance(tweet, str)
        assert len(tweet) > 0

    def test_large_values(self):
        tweet = generate_tweet(200, 300, 400, 500, 600, 200, 300, 400, 500, 600)
        assert len(tweet) <= 270

    def test_returns_string(self):
        result = generate_tweet(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
        assert isinstance(result, str)
