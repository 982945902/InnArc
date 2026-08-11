export default defineAppConfig({
  pages: ["pages/index/index"],
  subPackages: [
    { root: "pages/deck", pages: ["index"] },
    { root: "pages/history", pages: ["index"] },
    { root: "pages/about", pages: ["index"] },
    { root: "pages/legal", pages: ["index"] }
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#17382f",
    navigationBarTitleText: "心镜",
    navigationBarTextStyle: "white",
    backgroundColor: "#f5efe2"
  }
});
