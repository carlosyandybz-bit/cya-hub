import CyaApp from "./cya-app";
import { InitialEvaluationClassGate } from "./evaluation-initial-class";
import { EvaluationPostClassGate } from "./evaluation-post-class";
import { EvaluationPostClassPreparer } from "./evaluation-post-class-preparer";

export const dynamic = "force-dynamic";

export default function Home() {
  return <><CyaApp /><InitialEvaluationClassGate /><EvaluationPostClassPreparer /><EvaluationPostClassGate /></>;
}
