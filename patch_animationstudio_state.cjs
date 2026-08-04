const fs = require('fs');
let code = fs.readFileSync('src/components/AnimationStudio.tsx', 'utf8');

const searchState = `  const [zoomLevel, setZoomLevel] = useState(4); // 4x default zoom`;
const insertState = `  const [zoomLevel, setZoomLevel] = useState(4); // 4x default zoom
  const [viewMode, setViewMode] = useState<"standard" | "isometric">("standard");`;
code = code.replace(searchState, insertState);
fs.writeFileSync('src/components/AnimationStudio.tsx', code);
