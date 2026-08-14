import { readFileSync, writeFileSync } from "node:fs";
const path="app/bz-points-admin.tsx";
let source=readFileSync(path,"utf8");
const before='  const [draft, setDraft] = useState(() => rewardDraft(reward));\n  useEffect(() => setDraft(rewardDraft(reward)), [reward]);';
const after='  const [draft, setDraft] = useState(() => rewardDraft(reward));';
if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before)) throw new Error("Expected RewardEditor state sync exactly once");
source=source.replace(before,after);
writeFileSync(path,source);
