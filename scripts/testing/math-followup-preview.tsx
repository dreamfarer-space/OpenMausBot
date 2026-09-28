import { createRoot } from "react-dom/client";
import { ChatMarkdown } from "../../src/components/ChatMarkdown";
import "katex/dist/katex.min.css";
import "../../src/styles.css";

const root = createRoot(document.getElementById("root")!);
declare global { interface Window { renderMath(text: string, streaming?: boolean): void; } }
/** Update the isolated renderer with one synthetic streaming snapshot. */
window.renderMath = (text, streaming = false) => root.render(<ChatMarkdown text={text} streaming={streaming} />);
window.renderMath("Ready");
