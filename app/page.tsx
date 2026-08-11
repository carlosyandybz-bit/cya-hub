import CyaApp from "./cya-app";
import { InitialEvaluationClassGate } from "./evaluation-initial-class";
import { EvaluationPostClassGate } from "./evaluation-post-class";

export const dynamic = "force-dynamic";

export default function Home() {
  return <><CyaApp /><InitialEvaluationClassGate /><EvaluationPostClassGate /></>;
}
