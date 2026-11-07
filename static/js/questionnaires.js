/* Questionnaire content (items, scales, attention checks). */

// NARS (Nomura et al., 2006) was removed after Dr. Roy's review (2026-11-04): its items are about social robots,
// and this study uses a delivery robot. Robot experience is now asked in task.js (demographics). The old items
// are in the git history (tag v2-after-review).

// Multi-Dimensional Measure of Trust v1 (Ullman & Malle, 2018/2019). 0-7 + "Does not fit".
// Performance trust = Reliable + Capable, Moral trust = Ethical + Sincere.
var MDMT_ITEMS = [
  {id: 'reliable',    sub: 'Reliable', text: 'Reliable', hint: 'you can depend on it'},
  {id: 'skilled',     sub: 'Capable',  text: 'Skilled', hint: 'good at its job'},
  {id: 'sincere',     sub: 'Sincere',  text: 'Sincere', hint: 'means what it says'},
  {id: 'ethical',     sub: 'Ethical',  text: 'Ethical', hint: 'does what is right'},
  {id: 'predictable', sub: 'Reliable', text: 'Predictable', hint: 'you can guess what it will do'},
  {id: 'competent',   sub: 'Capable',  text: 'Competent', hint: 'able to do the job well'},
  {id: 'genuine',     sub: 'Sincere',  text: 'Genuine', hint: 'real, not fake'},
  {id: 'respectable', sub: 'Ethical',  text: 'Respectable', hint: 'deserves respect'},
  {id: 'countable',   sub: 'Reliable', text: 'Someone you can count on'},
  {id: 'mdmt_attn', attention: true, expected: 7, text: 'To show that you are reading, please pick 7 here'},
  {id: 'capable',     sub: 'Capable',  text: 'Capable', hint: 'able to do things'},
  {id: 'candid',      sub: 'Sincere',  text: 'Candid', hint: 'open and honest'},
  {id: 'principled',  sub: 'Ethical',  text: 'Principled', hint: 'sticks to good rules'},
  {id: 'consistent',  sub: 'Reliable', text: 'Consistent', hint: 'acts the same way every time'},
  {id: 'meticulous',  sub: 'Capable',  text: 'Meticulous', hint: 'very careful with details'},
  {id: 'authentic',   sub: 'Sincere',  text: 'Authentic', hint: 'true to itself'},
  {id: 'integrity',   sub: 'Ethical',  text: 'Has integrity', hint: 'honest and fair'}
];

// Capacity Trust subscale (Dr. Roy, 2026-11-07: trust is measured once, after the 3 deliveries, with this subscale
// only). MDMT Capacity trust = Reliable + Capable items (called Performance trust in MDMT v1; MDMT v2 names the
// Capable dimension "Competent", with the same items). Item order as in MDMT_ITEMS; the attention check stays in.
var MDMT_CAPACITY = MDMT_ITEMS.filter(function (it) { return it.attention || it.sub === 'Reliable' || it.sub === 'Capable'; });
