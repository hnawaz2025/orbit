// Metro leaves `import.meta` untouched by default, and Expo's web export loads
// the bundle as a classic script -- so a single `import.meta` anywhere in the
// dependency graph throws "Cannot use 'import.meta' outside a module" before
// React mounts, and the page renders white with no visible error.
//
// The transform rewrites it into something a classic script can evaluate. It
// only affects the web bundle; native was never affected, which is why this
// was invisible until the app was deployed and opened in a browser.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
