import React from "react";
import type { TimedWord } from "../captions/types";
import type { Scene } from "../schema/script";
import type { PresetName } from "../theme";
import { CodeScene } from "./CodeScene";
import { CompareScene } from "./CompareScene";
import { FlowScene } from "./FlowScene";
import { KeywordScene } from "./KeywordScene";
import { ListScene } from "./ListScene";
import { OutputScene } from "./OutputScene";
import { OutroScene } from "./OutroScene";
import { StatScene } from "./StatScene";
import { TextScene } from "./TextScene";
import { TitleScene } from "./TitleScene";

type SceneRendererProps = {
  scene: Scene;
  preset: PresetName;
  durationInFrames: number;
  handle?: string;
  words?: readonly TimedWord[];
};

/** Picks the scene component for `scene.type`. */
export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, handle, words, ...rest }) => {
  switch (scene.type) {
    case "title":
      return <TitleScene scene={scene} {...rest} />;
    case "code":
      return <CodeScene scene={scene} words={words} {...rest} />;
    case "text":
      return <TextScene scene={scene} {...rest} />;
    case "list":
      return <ListScene scene={scene} {...rest} />;
    case "outro":
      return <OutroScene scene={scene} handle={handle} {...rest} />;
    case "compare":
      return <CompareScene scene={scene} {...rest} />;
    case "keyword":
      return <KeywordScene scene={scene} {...rest} />;
    case "output":
      return <OutputScene scene={scene} {...rest} />;
    case "flow":
      return <FlowScene scene={scene} {...rest} />;
    case "stat":
      return <StatScene scene={scene} {...rest} />;
  }
};
