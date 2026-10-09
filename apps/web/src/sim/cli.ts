/**
 * RVX ROS-CLI emulator for the Level-1 terminal (xterm.js).
 * Parses real ROS 2 commands and turns them into engine commands.
 * Output text mimics real `ros2` output so skills transfer to a real robot.
 */
import type { Command } from "./engine";

type CommandInput = Command extends infer C ? (C extends { t: number; seq: number } ? Omit<C, "t" | "seq"> : never) : never;

export type CliResult =
  | { kind: "print"; text: string }
  | { kind: "apply"; command: CommandInput; text: string }
  | { kind: "repeat"; command: CommandInput; rateHz: number; times: number | null; text: string }
  | { kind: "echo"; once: boolean }
  | { kind: "teleop"; text: string }
  | { kind: "clear-screen" }
  | { kind: "error"; text: string };

// ------------------------------------------------------------- tokenizer
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "", quote: string | null = null, has = false;
  for (const ch of line) {
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has || cur) { out.push(cur); cur = ""; has = false; } continue; }
    cur += ch; has = true;
  }
  if (quote) throw new Error("unterminated quote");
  if (has || cur) out.push(cur);
  return out;
}

// --------------------------------------------- tiny YAML flow-map parser
// Accepts: {linear: {x: 2.0}, angular: {z: 1.57}}  |  "x: 1, y: 2, theta: 0"  |  {'off': 1}
type Y = number | string | boolean | null | { [k: string]: Y } | Y[];
export function parseYamlFlow(src: string): { [k: string]: Y } {
  let s = src.trim();
  if (!s) return {};
  if (!s.startsWith("{")) s = "{" + s + "}";
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const scalar = (stop: string): Y => {
    ws();
    if (s[i] === "'" || s[i] === '"') { const q = s[i++]; let v = ""; while (i < s.length && s[i] !== q) v += s[i++]; i++; return v; }
    let v = ""; while (i < s.length && !stop.includes(s[i])) v += s[i++];
    v = v.trim();
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return parseFloat(v);
    if (/^(true|True|yes|on)$/.test(v)) return true;
    if (/^(false|False|no|off)$/.test(v)) return false;
    if (v === "null" || v === "~" || v === "") return null;
    return v;
  };
  const value = (): Y => {
    ws();
    if (s[i] === "{") return map();
    if (s[i] === "[") { i++; const arr: Y[] = []; ws(); if (s[i] === "]") { i++; return arr; }
      for (;;) { arr.push(value()); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") { i++; return arr; } throw new Error("expected , or ]"); } }
    return scalar(",}]");
  };
  const map = (): { [k: string]: Y } => {
    i++; const o: { [k: string]: Y } = {}; ws();
    if (s[i] === "}") { i++; return o; }
    for (;;) {
      ws();
      const k = scalar(":,}");
      ws(); if (s[i] !== ":") throw new Error(`expected ':' after '${String(k)}'`); i++;
      o[String(k === false ? "off" : k === true ? "on" : k)] = value();
      ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") { i++; return o; }
      throw new Error("expected , or }");
    }
  };
  const r = value();
  ws(); if (i < s.length) throw new Error(`unexpected '${s.slice(i)}'`);
  if (typeof r !== "object" || r === null || Array.isArray(r)) throw new Error("expected a mapping");
  return r;
}

const num = (v: Y | undefined, d = 0): number => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : d);
const sub = (o: { [k: string]: Y }, k: string): { [k: string]: Y } => {
  const v = o[k]; return v && typeof v === "object" && !Array.isArray(v) ? v : {};
};
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// -------------------------------------------------------- static outputs
const TOPICS = ["/parameter_events", "/rosout", "/turtle1/cmd_vel", "/turtle1/color_sensor", "/turtle1/pose"];
const SERVICES = ["/clear", "/kill", "/reset", "/spawn", "/turtle1/set_pen", "/turtle1/teleport_absolute", "/turtle1/teleport_relative"];
const TYPES: Record<string, string> = {
  "/turtle1/cmd_vel": "geometry_msgs/msg/Twist", "/turtle1/pose": "turtlesim/msg/Pose",
  "/turtle1/color_sensor": "turtlesim/msg/Color", "/rosout": "rcl_interfaces/msg/Log", "/parameter_events": "rcl_interfaces/msg/ParameterEvent",
};
const INTERFACES: Record<string, string> = {
  "geometry_msgs/msg/Twist": "# This expresses velocity in free space broken into its linear and angular parts.\n\nVector3  linear\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z\nVector3  angular\n\tfloat64 x\n\tfloat64 y\n\tfloat64 z",
  "geometry_msgs/msg/Vector3": "float64 x\nfloat64 y\nfloat64 z",
  "turtlesim/msg/Pose": "float32 x\nfloat32 y\nfloat32 theta\n\nfloat32 linear_velocity\nfloat32 angular_velocity",
  "turtlesim/srv/TeleportAbsolute": "float32 x\nfloat32 y\nfloat32 theta\n---",
  "turtlesim/srv/TeleportRelative": "float32 linear\nfloat32 angular\n---",
  "turtlesim/srv/SetPen": "uint8 r\nuint8 g\nuint8 b\nuint8 width\nuint8 off\n---",
  "std_srvs/srv/Empty": "---",
  "turtlesim/action/RotateAbsolute": "# The desired heading in radians\nfloat32 theta\n---\n# The angular displacement in radians to the starting position\nfloat32 delta\n---\n# The remaining rotation in radians\nfloat32 remaining",
};
export const HELP = [
  "\x1b[1;36mRoboverse X — ROS 2 terminal (turtlesim already running)\x1b[0m",
  "  ros2 topic list | info <topic> | type <topic> | echo /turtle1/pose [--once]",
  "  ros2 topic pub [--once|-r HZ|-t N] /turtle1/cmd_vel geometry_msgs/msg/Twist \"{linear: {x: 2.0}, angular: {z: 1.57}}\"",
  "  ros2 service list | call <service> <type> \"<args>\"",
  "     /turtle1/teleport_absolute turtlesim/srv/TeleportAbsolute \"{x: 1.0, y: 1.0, theta: 0.0}\"",
  "     /turtle1/teleport_relative turtlesim/srv/TeleportRelative \"{linear: 2.0, angular: 0.0}\"",
  "     /turtle1/set_pen turtlesim/srv/SetPen \"{r: 255, g: 255, b: 255, width: 3, 'off': 0}\"",
  "     /clear std_srvs/srv/Empty     /reset std_srvs/srv/Empty",
  "  ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute \"{theta: 1.57}\"",
  "  ros2 run turtlesim turtle_teleop_key      (arrow keys, G/B/V/C/D/E/R/T, F cancel, Q quit)",
  "  ros2 interface show <type>   |  clear  |  history  |  help",
  "Tip: a Twist moves the turtle for exactly 1 second.  Ctrl+C stops a running command.",
].join("\r\n");

// --------------------------------------------------------------- runCli
export function runCli(line: string): CliResult {
  let a: string[];
  try { a = tokenize(line.trim()); } catch (e) { return { kind: "error", text: `bash: ${(e as Error).message}` }; }
  if (!a.length) return { kind: "print", text: "" };
  const [cmd] = a;
  if (cmd === "help" || cmd === "ros2" && a.length === 1) return { kind: "print", text: HELP };
  if (cmd === "clear") return { kind: "clear-screen" };
  if (cmd === "python3" || cmd === "python") return { kind: "print", text: "Python programs run in Level 2 (Editor tab). Level 1 is driven from this terminal." };
  if (cmd !== "ros2") return { kind: "error", text: `bash: ${cmd}: command not found  (type 'help')` };

  const [, group, verb] = a;
  try {
    if (group === "topic") return topic(verb, a.slice(3));
    if (group === "service") return service(verb, a.slice(3));
    if (group === "action") return action(verb, a.slice(3));
    if (group === "node" && verb === "list") return { kind: "print", text: "/teleop_turtle\r\n/turtlesim" };
    if (group === "interface" && verb === "show") {
      const t = INTERFACES[a[3]]; return t ? { kind: "print", text: t.replace(/\n/g, "\r\n") } : { kind: "error", text: `Unknown interface '${a[3] ?? ""}'` };
    }
    if (group === "run") {
      if (a[3] === "turtlesim" && a[4] === "turtle_teleop_key")
        return { kind: "teleop", text: "Reading from keyboard\r\n---------------------------\r\nUse arrow keys to move the turtle.\r\nUse G|B|V|C|D|E|R|T keys to rotate to absolute orientations. 'F' to cancel a rotation.\r\n'Q' to quit." };
      if (a[3] === "turtlesim" && a[4] === "turtlesim_node") return { kind: "print", text: "[INFO] [turtlesim]: turtlesim_node is already running in the Roboverse X arena." };
      return { kind: "error", text: `Package or executable not found: ${a.slice(3, 5).join(" ")}` };
    }
  } catch (e) {
    return { kind: "error", text: `Failed to populate field: ${(e as Error).message}` };
  }
  return { kind: "error", text: `ros2: '${a.slice(1).join(" ")}' is not supported here (type 'help')` };
}

function topic(verb: string, rest: string[]): CliResult {
  if (verb === "list") return { kind: "print", text: TOPICS.join("\r\n") };
  if (verb === "type" || verb === "info") {
    const t = TYPES[rest[0]]; if (!t) return { kind: "error", text: `Unknown topic '${rest[0] ?? ""}'` };
    return { kind: "print", text: verb === "type" ? t : `Type: ${t}\r\nPublisher count: ${rest[0] === "/turtle1/pose" ? 1 : 0}\r\nSubscription count: ${rest[0] === "/turtle1/cmd_vel" ? 1 : 0}` };
  }
  if (verb === "echo") {
    if (rest[0] !== "/turtle1/pose") return { kind: "error", text: "Only /turtle1/pose can be echoed in the arena" };
    return { kind: "echo", once: rest.includes("--once") };
  }
  if (verb === "pub") {
    let once = false, rate = 1, times: number | null = null;
    const pos: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const x = rest[i];
      if (x === "--once" || x === "-1") once = true;
      else if (x === "-r" || x === "--rate") rate = parseFloat(rest[++i]);
      else if (x === "-t" || x === "--times") times = parseInt(rest[++i], 10);
      else if (x === "-w" || x === "--wait-matching-subscriptions" || x === "--qos-profile" || x === "--qos-depth") i++;
      else pos.push(x);
    }
    const [tp, type, body = "{}"] = pos;
    if (tp !== "/turtle1/cmd_vel" && tp !== "turtle1/cmd_vel") return { kind: "error", text: `Topic '${tp ?? ""}' has no subscribers in the arena. Use /turtle1/cmd_vel` };
    if (type !== "geometry_msgs/msg/Twist" && type !== "geometry_msgs/Twist") return { kind: "error", text: `The passed message type '${type ?? ""}' is invalid (expected geometry_msgs/msg/Twist)` };
    if (!(rate > 0) || rate > 100) return { kind: "error", text: "--rate must be between 0 and 100 Hz" };
    const m = parseYamlFlow(body), lin = sub(m, "linear"), ang = sub(m, "angular");
    const command: CommandInput = { type: "cmd_vel", lx: num(lin.x), ly: num(lin.y), az: num(ang.z) };
    const repr = `geometry_msgs.msg.Twist(linear=geometry_msgs.msg.Vector3(x=${f(num(lin.x))}, y=${f(num(lin.y))}, z=${f(num(lin.z))}), angular=geometry_msgs.msg.Vector3(x=${f(num(ang.x))}, y=${f(num(ang.y))}, z=${f(num(ang.z))}))`;
    if (once) return { kind: "apply", command, text: `publisher: beginning loop\r\npublishing #1: ${repr}\r\n` };
    return { kind: "repeat", command, rateHz: rate, times, text: `publisher: beginning loop\r\n__N__${repr}` };
  }
  return { kind: "error", text: `ros2 topic ${verb ?? ""}: not supported here` };
}

function service(verb: string, rest: string[]): CliResult {
  if (verb === "list") return { kind: "print", text: SERVICES.join("\r\n") };
  if (verb !== "call") return { kind: "error", text: `ros2 service ${verb ?? ""}: not supported here` };
  const [name, type, body = "{}"] = rest;
  const m = parseYamlFlow(body);
  const req = (t: string, fields: string) => `requester: making request: ${t}_Request(${fields})\r\n\r\nresponse:\r\n${t}_Response()\r\n`;
  switch (name) {
    case "/turtle1/teleport_absolute":
      if (type !== "turtlesim/srv/TeleportAbsolute") break;
      return { kind: "apply", command: { type: "teleport_abs", x: num(m.x), y: num(m.y), theta: num(m.theta) },
        text: req("turtlesim.srv.TeleportAbsolute", `x=${f(num(m.x))}, y=${f(num(m.y))}, theta=${f(num(m.theta))}`) };
    case "/turtle1/teleport_relative":
      if (type !== "turtlesim/srv/TeleportRelative") break;
      return { kind: "apply", command: { type: "teleport_rel", linear: num(m.linear), angular: num(m.angular) },
        text: req("turtlesim.srv.TeleportRelative", `linear=${f(num(m.linear))}, angular=${f(num(m.angular))}`) };
    case "/turtle1/set_pen":
      if (type !== "turtlesim/srv/SetPen") break;
      return { kind: "apply", command: { type: "set_pen", r: num(m.r), g: num(m.g), b: num(m.b), width: num(m.width, 3), off: num(m.off) },
        text: req("turtlesim.srv.SetPen", `r=${num(m.r)}, g=${num(m.g)}, b=${num(m.b)}, width=${num(m.width, 3)}, off=${num(m.off)}`) };
    case "/clear": case "/reset":
      if (type !== "std_srvs/srv/Empty") break;
      return { kind: "apply", command: { type: name === "/clear" ? "clear" : "reset" }, text: req("std_srvs.srv.Empty", "") };
    case "/spawn": case "/kill":
      return { kind: "error", text: "Only turtle1 exists in the Roboverse X arena — /spawn and /kill are disabled." };
    default:
      return { kind: "error", text: `Service '${name ?? ""}' not found. Try: ros2 service list` };
  }
  return { kind: "error", text: `The passed service type '${type ?? ""}' is invalid for ${name}` };
}

function action(verb: string, rest: string[]): CliResult {
  if (verb === "list") return { kind: "print", text: "/turtle1/rotate_absolute" };
  if (verb !== "send_goal") return { kind: "error", text: `ros2 action ${verb ?? ""}: not supported here` };
  const [name, type, body = "{}"] = rest;
  if (name !== "/turtle1/rotate_absolute" || type !== "turtlesim/action/RotateAbsolute")
    return { kind: "error", text: "Use: ros2 action send_goal /turtle1/rotate_absolute turtlesim/action/RotateAbsolute \"{theta: 1.57}\"" };
  const th = num(parseYamlFlow(body).theta);
  return { kind: "apply", command: { type: "rotate_abs", theta: th }, text: `Waiting for an action server to become available...\r\nSending goal:\r\n     theta: ${f(th)}\r\n\r\nGoal accepted :)\r\n` };
}

// ----------------------------------------------------------- teleop keys
/** Same mapping as ROS 2 turtle_teleop_key (linear 2.0, angular 2.0). */
export function teleopKey(key: string): CommandInput | "quit" | "cancel" | null {
  switch (key) {
    case "ArrowUp": return { type: "cmd_vel", lx: 2.0, ly: 0, az: 0 };
    case "ArrowDown": return { type: "cmd_vel", lx: -2.0, ly: 0, az: 0 };
    case "ArrowLeft": return { type: "cmd_vel", lx: 0, ly: 0, az: 2.0 };
    case "ArrowRight": return { type: "cmd_vel", lx: 0, ly: 0, az: -2.0 };
  }
  const k = key.toLowerCase();
  const abs: Record<string, number> = { g: 0, t: Math.PI / 4, r: Math.PI / 2, e: (3 * Math.PI) / 4, d: Math.PI, c: (-3 * Math.PI) / 4, v: -Math.PI / 2, b: -Math.PI / 4 };
  if (k in abs) return { type: "rotate_abs", theta: abs[k] };
  if (k === "f") return "cancel";
  if (k === "q") return "quit";
  return null;
}
