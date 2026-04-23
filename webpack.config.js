const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    popup: "./src/popup.ts",
    webApp: "./src/webApp.ts"
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: (pathData) =>
      pathData.chunk.name === "webApp" ? "web/webApp.js" : "[name].js",
    clean: true
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "src/popup.html", to: "popup.html" },
        { from: "web/index.html", to: "web/index.html" },
        { from: "web/manifest.webmanifest", to: "web/manifest.webmanifest" },
        { from: "assets/icon-16.png", to: "icons/icon-16.png" },
        { from: "assets/icon-48.png", to: "icons/icon-48.png" },
        { from: "assets/icon-128.png", to: "icons/icon-128.png" },
        { from: "assets/icon-128.png", to: "web/icons/icon-128.png" }
      ]
    })
  ]
};
