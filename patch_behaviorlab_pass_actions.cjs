const fs = require('fs');
let code = fs.readFileSync('src/components/BehaviorLab.tsx', 'utf8');

const search = `  const [engine] = useState(() => new BehaviorEngine(640, 360));`;
const replace = `  const [engine] = useState(() => {
    const e = new BehaviorEngine(640, 360);
    e.setAvailableActions(creature.animations.map(a => a.name.toLowerCase()));
    return e;
  });

  // Keep actions updated if creature changes
  useEffect(() => {
    engine.setAvailableActions(creature.animations.map(a => a.name.toLowerCase()));
  }, [creature, engine]);`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/BehaviorLab.tsx', code);
