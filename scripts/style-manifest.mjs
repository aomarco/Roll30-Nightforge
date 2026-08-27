export const STYLE_FILES = Object.freeze([
  "src/styles/functional-states.css",
  "src/styles/library-states.css",
  "src/styles/heroes-states.css",
  "src/styles/table-states.css",
]);

export const readStyles = async (read) => (
  await Promise.all(STYLE_FILES.map((file) => read(file)))
).join("\n");
