// Page thumbnails are drawn one at a time, across every list that shows them:
// rendering several big scanned pages at once is what runs a small device out
// of memory.
let queue = Promise.resolve();

export function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}
