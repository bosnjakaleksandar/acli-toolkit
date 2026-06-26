import figlet from "figlet";
import gradient from "gradient-string";

export async function showBanner() {
  console.log("");

  const asciiArt = figlet.textSync("PROJECT SETUP", { font: "Standard" });
  console.log(gradient(["#ffb800", "#ff6a00"]).multiline(asciiArt));

  const frames = [
    `  ╭───────╮  Aca:\n  │ ^ ◡ ^ │  Ready to build something awesome?\n  ╰───────╯`,
    `  ╭───────╮  Aca:\n  │ o ◡ o │  Ready to build something awesome?\n  ╰───────╯`,
    `  ╭───────╮  Aca:\n  │ - ◡ - │  Ready to build something awesome?\n  ╰───────╯`,
    `  ╭───────╮  Aca:\n  │ > ◡ < │  Ready to build something awesome?\n  ╰───────╯`,
  ];

  console.log("");
  console.log(frames[0]);

  let i = 1;
  const interval = setInterval(() => {
    process.stdout.write("\x1B[3A\x1B[0J");
    console.log(frames[i % frames.length]);
    i++;
  }, 250);

  await new Promise((resolve) => setTimeout(resolve, 2500));
  clearInterval(interval);
  process.stdout.write("\x1B[3A\x1B[0J");
  console.log(frames[0] + "\n");
}
