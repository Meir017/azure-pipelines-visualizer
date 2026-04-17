import { Hono } from 'hono';
import {
  type BuildInfo,
  listBuildsForDefinition,
} from '../services/azure-devops.js';

const health = new Hono();

interface HealthMetrics {
  totalBuilds: number;
  successRate: number;
  avgDurationSeconds: number;
  avgQueueWaitSeconds: number;
  longestFailureStreak: number;
  currentFailureStreak: number;
  durationStdDev: number;
  recentTrend: ('succeeded' | 'failed' | 'other')[];
  score: number;
}

function computeHealth(builds: BuildInfo[]): HealthMetrics {
  const completed = builds.filter(
    (b) => b.status === 'completed' && b.result,
  );

  if (completed.length === 0) {
    return {
      totalBuilds: 0,
      successRate: 0,
      avgDurationSeconds: 0,
      avgQueueWaitSeconds: 0,
      longestFailureStreak: 0,
      currentFailureStreak: 0,
      durationStdDev: 0,
      recentTrend: [],
      score: 0,
    };
  }

  // Success rate
  const succeeded = completed.filter((b) => b.result === 'succeeded').length;
  const successRate = succeeded / completed.length;

  // Durations
  const durations: number[] = [];
  const queueWaits: number[] = [];
  for (const b of completed) {
    if (b.startTime && b.finishTime) {
      durations.push(
        (new Date(b.finishTime).getTime() - new Date(b.startTime).getTime()) /
          1000,
      );
    }
    if (b.startTime && b.queueTime) {
      queueWaits.push(
        (new Date(b.startTime).getTime() - new Date(b.queueTime).getTime()) /
          1000,
      );
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgDuration = avg(durations);
  const avgQueueWait = avg(queueWaits);

  // Standard deviation of duration
  const durationStdDev =
    durations.length > 1
      ? Math.sqrt(
          durations.reduce((sum, d) => sum + (d - avgDuration) ** 2, 0) /
            (durations.length - 1),
        )
      : 0;

  // Failure streaks (most recent first)
  let longestStreak = 0;
  let currentStreak = 0;
  let streak = 0;
  for (let i = 0; i < completed.length; i++) {
    if (completed[i].result === 'failed') {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
      if (i === 0) currentStreak = streak;
    } else {
      if (i <= streak) currentStreak = streak;
      streak = 0;
    }
  }
  if (completed[0].result === 'failed') {
    // Recalculate current streak
    currentStreak = 0;
    for (const b of completed) {
      if (b.result === 'failed') currentStreak++;
      else break;
    }
  } else {
    currentStreak = 0;
  }

  // Recent trend (last 30 builds)
  const recentTrend = completed.slice(0, 30).map((b) => {
    if (b.result === 'succeeded') return 'succeeded' as const;
    if (b.result === 'failed') return 'failed' as const;
    return 'other' as const;
  });

  // Composite score (0-100)
  const successScore = successRate * 40;

  // Queue wait score: 0s = perfect, 300s+ = 0
  const queueScore = Math.max(0, 1 - avgQueueWait / 300) * 15;

  // Failure streak score: 0 = perfect, 5+ = 0
  const streakScore = Math.max(0, 1 - longestStreak / 5) * 15;

  // Consistency score: low stddev relative to mean is good
  const cv = avgDuration > 0 ? durationStdDev / avgDuration : 0;
  const consistencyScore = Math.max(0, 1 - cv) * 10;

  // Duration trend score: compare first half vs second half avg duration
  let trendScore = 10; // neutral
  if (durations.length >= 4) {
    const mid = Math.floor(durations.length / 2);
    const recentAvg = avg(durations.slice(0, mid));
    const olderAvg = avg(durations.slice(mid));
    if (olderAvg > 0) {
      const ratio = recentAvg / olderAvg;
      // ratio < 1 means improving (faster), ratio > 1 means degrading
      trendScore = Math.max(0, Math.min(20, (2 - ratio) * 10));
    }
  }

  const score = Math.round(
    successScore + queueScore + streakScore + consistencyScore + trendScore,
  );

  return {
    totalBuilds: completed.length,
    successRate: Math.round(successRate * 1000) / 10,
    avgDurationSeconds: Math.round(avgDuration),
    avgQueueWaitSeconds: Math.round(avgQueueWait),
    longestFailureStreak: longestStreak,
    currentFailureStreak: currentStreak,
    durationStdDev: Math.round(durationStdDev),
    recentTrend,
    score: Math.max(0, Math.min(100, score)),
  };
}

health.get(
  '/:org/:project/definitions/:definitionId/health',
  async (c) => {
    const { org, project, definitionId } = c.req.param();
    const top = Number(c.req.query('top') ?? '100');
    const builds = await listBuildsForDefinition(
      org,
      project,
      Number(definitionId),
      top,
    );
    const metrics = computeHealth(builds);
    return c.json(metrics);
  },
);

export { health };
