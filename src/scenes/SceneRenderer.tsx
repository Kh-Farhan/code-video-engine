import React from "react";
import type { Scene } from "../schema/script";
import type { PresetName } from "../theme";
import { CodeScene } from "./CodeScene";
import { ListScene } from "./ListScene";
import { OutroScene } from "./OutroScene";
import { TextScene } from "./TextScene";
import { TitleScene } from "./TitleScene";

type SceneRendererProps = {
  scene: Scene;
  preset: PresetName;
  durationInFrames: number;
};

/** Picks the scene component for `scene.type`. */
export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, ...rest }) => {
  switch (scene.type) {
    case "title":
      return <TitleScene scene={scene} {...rest} />;
    case "code":
      return <CodeScene scene={scene} {...rest} />;
    case "text":
      return <TextScene scene={scene} {...rest} />;
    case "list":
      return <ListScene scene={scene} {...rest} />;
    case "outro":
      return <OutroScene scene={scene} {...rest} />;
  }
};
