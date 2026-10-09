"use client";

import { useEffect, useRef, useState } from "react";
import { RvxSimulator, RvxTerminal, rvx, useRvx } from "@/rvx-runtime";

const STARTER = `#!/usr/bin/env python3
import math
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from turtlesim.msg import Pose

GOAL = (11.0, 11.0)


class TurtleController(Node):
    def __init__(self):
        super().__init__('turtle_controller')
        self.publisher = self.create_publisher(Twist, '/turtle1/cmd_vel', 10)
        self.create_subscription(Pose, '/turtle1/pose', self.on_pose, 10)
        self.pose = None
        self.timer = self.create_timer(0.1, self.move_to_goal)
        self.get_logger().info('Node started')

    def on_pose(self, msg):
        self.pose = msg

    def move_to_goal(self):
        if self.pose is None:
            return
        dx, dy = GOAL[0] - self.pose.x, GOAL[1] - self.pose.y
        dist = math.hypot(dx, dy)
        msg = Twist()
        if dist < 0.05:
            self.publisher.publish(msg)
            self.get_logger().info('Goal reached!')
            self.get_logger().info('Stopping...')
            self.timer.cancel()
            rclpy.shutdown()
            return
        heading = math.atan2(dy, dx)
        err = math.atan2(math.sin(heading - self.pose.theta), math.cos(heading - self.pose.theta))
        msg.angular.z = 4.0 * err
        msg.linear.x = min(2.0, 1.5 * dist) if abs(err) < 0.3 else 0.0
        self.publisher.publish(msg)
        if round(self.pose.x * 10) % 10 == 0:
            self.get_logger().info(f'current position: ({self.pose.x:.2f}, {self.pose.y:.2f})')


def main():
    rclpy.init()
    node = TurtleController()
    rclpy.spin(node)


if __name__ == '__main__':
    main()
`;

export default function RvxDemo() {
  const [code, setCode] = useState(STARTER);
  const codeRef = useRef(code);
  codeRef.current = code;
  const s = useRvx();

  useEffect(() => {
    rvx.configure({
      user: "arunesh",
      host: "roboverse-x",
      fileName: "main.py",
      getCode: () => codeRef.current,
      task: { goal: { x: 11.0, y: 11.0, tolerance: 0.1 } },
    });
  }, []);

  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1C2A4A" }}>
      <span style={{ color: "#8EA0C4" }}>{k}</span>
      <span style={{ fontFamily: "ui-monospace, monospace" }}>{v}</span>
    </div>
  );
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 6, border: "1px solid #2A3D66", background: "#101B33", color: "#E7EEFC", cursor: "pointer" };

  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "360px 1fr", gap: 12, padding: 12, height: "100dvh", boxSizing: "border-box", color: "#E7EEFC" }}>
      <section style={{ gridColumn: "1 / 3", display: "grid", gridTemplateColumns: "1fr 280px", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden" }}>
        <RvxSimulator />
        <div style={{ background: "#0B1326", padding: 14, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Simulation Info</div>
          {row("Status", `${s.runtime} · ${s.activity}`)}
          {row("Position", `(${s.pose.x.toFixed(2)}, ${s.pose.y.toFixed(2)})`)}
          {row("Heading", `${((s.pose.theta * 180) / Math.PI).toFixed(1)}°`)}
          {row("v / ω", `${s.linear.toFixed(2)} / ${s.angular.toFixed(2)}`)}
          {row("Sim time", `${s.simTime.toFixed(2)} s`)}
          {row("Goal", s.goal ? `(${s.goal.x}, ${s.goal.y})` : "—")}
          {row("Distance", s.distance === null ? "—" : `${s.distance.toFixed(2)} units`)}
          {row("Reached", s.goalReached ? "yes" : "no")}
          {row("Last run", s.lastRun ? s.lastRun.status : "—")}
        </div>
      </section>
      <section style={{ display: "flex", flexDirection: "column", border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
        <textarea
          aria-label="main.py"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ flex: 1, background: "#0B1326", color: "#D6E2FF", border: 0, padding: 12, fontFamily: "ui-monospace, monospace", fontSize: 13, resize: "none", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, padding: 8, background: "#101B33" }}>
          <button style={{ ...btn, background: "#3D7BFF", borderColor: "#3D7BFF" }} onClick={() => rvx.run()}>Run code</button>
          <button style={btn} onClick={() => rvx.stop()}>Stop</button>
          <button style={btn} onClick={() => rvx.reset()}>Reset</button>
          <button style={btn} onClick={() => rvx.clearTerminal()}>Clear</button>
        </div>
      </section>
      <section style={{ border: "1px solid #1C2A4A", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
        <RvxTerminal />
      </section>
    </main>
  );
}
