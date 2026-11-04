/* Study design switch (see task.js header).
 * 'within'  = submitted design: every participant meets 2 robots, one per autonomy level (order counterbalanced).
 *             psiturk/config.txt: num_conds = 2, num_counters = 2.
 * 'between' = each participant meets 1 robot (Nova) at 1 autonomy level (4 groups).
 *             psiturk/config.txt: num_conds = 4, num_counters = 1.
 * Change both together, then restart the PsiTurk server. */
var STUDY_DESIGN = 'within';
