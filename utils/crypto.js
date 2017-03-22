const fs = require('fs'), c = require('crypto'), a = 'aes-256-ctr', b = '6FRF0Z1U3B';

function en(text){
  var ci = c.createCipher(a,b);
  var cry = ci.update(text,'utf8','hex')
  cry += ci.final('hex'); return cry;
}
 
function de(text){
  var de = c.createDecipher(a,b)
  var dec = de.update(text,'hex','utf8');
  dec += de.final('utf8'); return dec;
}