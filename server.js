const app = require("./app");

const PORT = process.env.PORT || 1000;

app.listen(PORT, () => {
  console.log(`Sunless site + API running at http://localhost:${PORT}`);
});