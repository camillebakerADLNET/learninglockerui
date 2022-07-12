import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import express from 'express';

/**
 * Creates application bundles from the source files using webpack
 * Can run in 3 modes
 * Single
 * Watch (delta rebuilds using hdd cache)
 * Dev-server (all assets cached in memory, nothing written to disk, changes served to application by webpack)
 */
function bundle({
  webpackConfig,
  watch = false,
  devPort,
}) {
  return new Promise((resolve, reject) => {
    const compiler = webpack(webpackConfig);

    const onComplete = (err) => {
      if (err) {
        console.error(err);
        return reject(err);
      }
      return resolve();
    };

    const logThenComplete = (err, stats) => {
      if (err) return onComplete(err);
      console.log(stats.toString({
        colors: true    // Shows colors in the console
      }));
      return onComplete(null);
    };
    if (devPort) {
      // compiler.plugin('done', onComplete);
      const app = express();
      app.use(webpackDevMiddleware(compiler, {
        stats: webpackConfig.stats,
        publicPath: webpackConfig.output.publicPath,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }));

      // --------------------
      // Copies static
      const compiler2 = webpack({
        entry: { client: 'client.js' },
        plugins: [
          webpackConfig.plugins[1]
        ]
      });
      compiler2.run(() => {});

      app.listen(devPort, () => {
        console.log(`Listening on port ${devPort}!`);
      });
    } else {
      compiler.run(logThenComplete);
    }
  });
}

export default bundle;
