/** Known SOS/HWP math-font glyphs only; leave unknown glyphs for review. */
export function normalizePdfAnswerText(value:unknown):string{
 const digits:Record<number,string>={0xe03d:'0',0xe034:'1',0xe035:'2',0xe036:'3',0xe037:'4',0xe038:'5',0xe039:'6',0xe03a:'7',0xe03b:'8',0xe03c:'9',0xe046:'-'};
 return String(value??'').replace(/[\uE034-\uE03D\uE046]/g,c=>digits[c.charCodeAt(0)]??c).replace(/[−﹣－]/g,'-').trim();
}
