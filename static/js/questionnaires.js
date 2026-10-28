/* Questionnaire content (items, scales, attention checks). */

// Negative Attitudes toward Robots Scale (Nomura et al., 2006). 5-point Likert.
// S1 = interaction situations, S2 = social influence, S3 = emotions in interaction (reverse-scored).
var NARS_ITEMS = [
  {id: 'nars1',  sub: 'S2', text: 'I would feel uneasy if robots really had emotions.'},
  {id: 'nars2',  sub: 'S2', text: 'Something bad might happen if robots developed into living beings.'},
  {id: 'nars3',  sub: 'S3', reverse: true, text: 'I would feel relaxed talking with robots.'},
  {id: 'nars4',  sub: 'S1', text: 'I would feel uneasy if I was given a job where I had to use robots.'},
  {id: 'nars5',  sub: 'S3', reverse: true, text: 'If robots had emotions, I would be able to make friends with them.'},
  {id: 'nars6',  sub: 'S3', reverse: true, text: 'I feel comforted being with robots that have emotions.'},
  {id: 'nars7',  sub: 'S1', text: 'The word "robot" means nothing to me.'},
  {id: 'nars_attn', attention: true, expected: 5,
   text: 'To show that you are reading carefully, please select "Strongly agree" for this item.'},
  {id: 'nars8',  sub: 'S1', text: 'I would feel nervous operating a robot in front of other people.'},
  {id: 'nars9',  sub: 'S1', text: 'I would hate the idea that robots or artificial intelligences were making judgements about things.'},
  {id: 'nars10', sub: 'S1', text: 'I would feel very nervous just standing in front of a robot.'},
  {id: 'nars11', sub: 'S2', text: 'I feel that if I depend on robots too much, something bad might happen.'},
  {id: 'nars12', sub: 'S1', text: 'I would feel paranoid talking with a robot.'},
  {id: 'nars13', sub: 'S2', text: 'I am concerned that robots would be a bad influence on children.'},
  {id: 'nars14', sub: 'S2', text: 'I feel that in the future society will be dominated by robots.'}
];
var NARS_SCALE = ['Strongly disagree', 'Disagree', 'Undecided', 'Agree', 'Strongly agree']; // coded 1-5

// Multi-Dimensional Measure of Trust v1 (Ullman & Malle, 2018/2019). 0-7 + "Does not fit".
// Performance trust = Reliable + Capable, Moral trust = Ethical + Sincere.
var MDMT_ITEMS = [
  {id: 'reliable',    sub: 'Reliable', text: 'Reliable'},
  {id: 'skilled',     sub: 'Capable',  text: 'Skilled'},
  {id: 'sincere',     sub: 'Sincere',  text: 'Sincere'},
  {id: 'ethical',     sub: 'Ethical',  text: 'Ethical'},
  {id: 'predictable', sub: 'Reliable', text: 'Predictable'},
  {id: 'competent',   sub: 'Capable',  text: 'Competent'},
  {id: 'genuine',     sub: 'Sincere',  text: 'Genuine'},
  {id: 'respectable', sub: 'Ethical',  text: 'Respectable'},
  {id: 'countable',   sub: 'Reliable', text: 'Someone you can count on'},
  {id: 'mdmt_attn', attention: true, expected: 7, text: 'Attention check: please select 7 in this row'},
  {id: 'capable',     sub: 'Capable',  text: 'Capable'},
  {id: 'candid',      sub: 'Sincere',  text: 'Candid'},
  {id: 'principled',  sub: 'Ethical',  text: 'Principled'},
  {id: 'consistent',  sub: 'Reliable', text: 'Consistent'},
  {id: 'meticulous',  sub: 'Capable',  text: 'Meticulous'},
  {id: 'authentic',   sub: 'Sincere',  text: 'Authentic'},
  {id: 'integrity',   sub: 'Ethical',  text: 'Has integrity'}
];
