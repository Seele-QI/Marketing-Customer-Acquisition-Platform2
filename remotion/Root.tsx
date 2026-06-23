import { Composition } from "remotion";
import { EditingComposition, editingSchema } from "./EditingComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AutoEdit"
      component={EditingComposition}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={300}
      schema={editingSchema}
      defaultProps={{
        videoUrl: "",
        preset: "smooth",
        subtitleText: "",
        bgMusicUrl: "",
      }}
    />
  );
};
