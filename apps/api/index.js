const express = require("express");
const app = express();

// جملة تجريبية
app.get("/", (req, res) => {
  res.send("🚀 API server is running on Railway!");
});

// أهم شي: استخدم PORT من Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
