-- Keep profile accuracy based on scored predictions only.
-- Submitted prediction totals remain available from public.predictions rows.

with profile_prediction_stats as (
  select
    pr.id as user_id,
    count(p.id) filter (
      where coalesce(p.result_points_applied, false)
        or p.scoring_outcome is not null
        or p.scored_at is not null
        or p.result::text <> 'pending'
    )::integer as scored_predictions,
    count(p.id) filter (
      where (
        coalesce(p.result_points_applied, false)
        or p.scoring_outcome is not null
        or p.scored_at is not null
        or p.result::text <> 'pending'
      ) and (
        coalesce(p.points, 0) > 0
        or coalesce(p.points_awarded, 0) > 0
        or coalesce(p.points_earned, 0) > 0
        or p.scoring_outcome in ('exact', 'result')
        or p.result::text = 'correct'
      )
    )::integer as correct_predictions
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  group by pr.id
)
update public.profiles pr
set
  total_predictions = stats.scored_predictions,
  prediction_count = stats.scored_predictions,
  correct_predictions = stats.correct_predictions,
  correct_prediction_count = stats.correct_predictions,
  accuracy = case
    when stats.scored_predictions = 0 then 0
    else round(stats.correct_predictions::numeric / stats.scored_predictions::numeric * 100, 2)
  end
from profile_prediction_stats stats
where pr.id = stats.user_id;

comment on column public.profiles.total_predictions is 'Scored predictions used as the profile accuracy denominator. Submitted totals should be counted from public.predictions rows.';
comment on column public.profiles.prediction_count is 'Legacy scored prediction count used as the profile accuracy denominator.';
comment on column public.profiles.correct_predictions is 'Correct scored predictions used as the profile accuracy numerator.';
comment on column public.profiles.accuracy is 'Percentage of correct scored predictions: correct_predictions / total_predictions * 100. Pending predictions are excluded.';
