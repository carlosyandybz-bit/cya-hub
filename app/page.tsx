import CyaApp from "./cya-app";
import { EvaluationPostClassGate } from "./evaluation-post-class";

export const dynamic = "force-dynamic";

export default function Home() {
  return <><CyaApp /><EvaluationPostClassGate /></>;
}
