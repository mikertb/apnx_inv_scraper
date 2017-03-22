/**
 * This will execute each JSON country list provided in task array. Use this
 * as part of regular update routine.
 * 
 */
const fs   = require('fs');
const exec = require('child_process').exec;
const task = eval(fs.readFileSync('js/update_queue.js',{encoding:'utf8'}));
var   done = 0;

function update(){
    if(done < task.length){
        let cmd = 'node ./update_db.js '+task[done];
        exec(cmd,(error,stdout,stderr)=>{
            done++;
            setTimeout(update,1500);
        });
    }else{
        console.log("All tasks completed.");
    }
}
update();