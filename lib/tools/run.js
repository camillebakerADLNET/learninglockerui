import Moment from "moment";

function run(fn, options) {

  const task = typeof fn.default === "undefined" ? fn : fn.default;
  const start = new Moment();
  console.log(`[${start.toISOString()}] Starting  '${task.name} ...`);
  
  return task(options).then((resolution) => {
    const end = new Moment();
    const time = Moment.duration(end.diff(start));
    console.log(`[${end.toISOString()}] Finished '${task.name} after ${time} ms`);
    return resolution;
  });
}

if (require.main === module && process.argv.length > 2) {
  delete require.cache[__filename]; // eslint-disable-line no-underscore-dangle

  const moduleName = `./${process.argv[2]}.js`;
  const module = require(moduleName).default; // eslint-disable-line import/no-dynamic-require
  
  run(module).catch((err) => {
    console.error(err.stack);
    process.exit(1);
  });
}

export default run;
