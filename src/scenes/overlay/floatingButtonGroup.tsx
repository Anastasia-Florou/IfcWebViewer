import { Box, ButtonGroup, IconButton, useTheme } from "@mui/material";
import { useContext } from "react";
import { tokens } from "../../theme";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import TocIcon from "@mui/icons-material/Toc";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ZoomInMapOutlined from "@mui/icons-material/ZoomInMapOutlined";
import CameraEnhance from "@mui/icons-material/CameraEnhance";
import { GetAdjacentGroup, SelectionGroup } from "../../utilities/BuildingElementUtilities";
import { ComponentsContext } from "../../context/ComponentsContext";
import { CommentIconButton } from "./src/commentIconButton";
import { ModelViewManager } from "../../bim-components/modelViewer";
import { ModelCache } from "../../bim-components/modelCache";
import Stats from "stats.js";

interface floatingButtonProps {
  togglePropertyPanelVisibility: () => void;
  toggleGroupsPanelVisibility: () => void;
}

const FloatingButtonGroup = ({ togglePropertyPanelVisibility, toggleGroupsPanelVisibility }: floatingButtonProps) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const components = useContext(ComponentsContext);

  const setAdjacentGroup = (adjacency: "previous" | "next") => {
    console.log();
    if (!components) return;

    const viewManager = components.get(ModelViewManager);

    const current = viewManager.SelectedGroup;

    if (!viewManager.Groups) return;

    if (!current) {
      console.log("No group selected, default will be used");
    }
    const newGroup = GetAdjacentGroup(current, viewManager.Groups, adjacency);
    if (newGroup) {
      const visMap = IsolateSelected(components, newGroup);

      viewManager.GroupVisibility = visMap;
      viewManager.SelectedGroup = newGroup;

      // set up
    }
  };

  const IsolateSelected = (components: OBC.Components, selected: SelectionGroup) => {
    const viewManager = components.get(ModelViewManager);
    const visMap = new Map(viewManager.GroupVisibility);
    visMap.forEach((visState, groupName) => visMap.set(groupName, true));
    const matchingGroupType = viewManager.Groups?.get(selected.groupType)?.keys();
    if (!matchingGroupType) return;

    for (let groupName of Array.from(matchingGroupType)) {
      if (groupName !== selected.groupName) visMap.set(groupName, false);
    }
    return visMap;
  };

  const zoomAll = () => {
    if (!components) return;
    const cache = components.get(ModelCache);
    if (!cache.world) return;

    setTimeout(async () => {
      if (!cache.world?.meshes) return;
      let cam = cache.world.camera as OBC.OrthoPerspectiveCamera;
      cam.fit(cache.world?.meshes, 0.5);
    }, 50);
  };

  const setCameraProjection = () => {
    const cache = components?.get(ModelCache);
    if (!cache?.world) return;
    let cam = cache.world.camera as OBC.OrthoPerspectiveCamera;

    console.log("cam mode setting:", cam.projection.current);

    if (cam.projection.current === "Perspective") {
      cam.projection.set("Orthographic");
      cam.set("Orbit" as OBC.NavModeID);
    } else {
      cam.projection.set("Perspective");
      cam.set("Orbit" as OBC.NavModeID);
    }

    zoomAll();
  };

  const setCamView = () => {
    const cache = components?.get(ModelCache);
    if (!cache?.world) return;

    let cam = cache.world.camera as OBC.OrthoPerspectiveCamera;
    cam.projection.set("Orthographic");
    cam.set("Plan" as OBC.NavModeID);


    const bbox = new THREE.Box3().setFromObject(cache.world.scene.three);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    // console.log("cam bbox center:", center.x,center.y,center.z);

    // Calculate the larger of width and depth for optimal framing
    const maxSize = Math.max(size.x, size.z);

    // Set camera position
    const cameraHeight = Math.max(size.y, maxSize) * 2; // Ensure camera is high enough
    cam.controls.setPosition(center.x, center.y + cameraHeight, center.z, false);
    console.log("cam position center:", center.x,center.y + cameraHeight,center.z);

    // Set camera target to look at the center
    cam.controls.setTarget(center.x, center.y, center.z, false);
    console.log("cam target center:", center.x,center.y,center.z);
    

    // cam.controls.up

    // cam.fit(cache.world?.meshes, 0.5);
    // console.log("cam mode setting:", cam.mode.id, cam.mode.enabled);
  };

  return (
    <>
      <Box component={"div"}>
        <div
          style={{
            position: "fixed",
            bottom: 50,
            left: "40%",
            transform: "translateX(-50%,0)",
            zIndex: 500,
            width: 450,
            height: 35,
            cursor: "grab",
            display: "inline-block",
          }}
        >
          <ButtonGroup variant="contained" style={{ backgroundColor: colors.primary[400] }}>
            <div>{/* <DragIndicatorIcon /> */}</div>

            <IconButton style={floatingButtonStyle} onClick={() => toggleGroupsPanelVisibility()}>
              <TocIcon fontSize="medium" />
            </IconButton>
            <IconButton style={floatingButtonStyle} onClick={() => togglePropertyPanelVisibility()}>
              <DescriptionOutlined fontSize="small" />
            </IconButton>

            <IconButton style={floatingButtonStyle} onClick={() => setCameraProjection()}>
              <CameraEnhance fontSize="small" />
            </IconButton>
            {/* 
            <IconButton style={floatingButtonStyle} onClick={() => setCameraMode()}>
              <CameraEnhance fontSize="small" />
            </IconButton> */}

            <IconButton
              style={floatingButtonStyle}
              onClick={() => {
                setCamView();
              }}
            >
              <ZoomInMapOutlined fontSize="small" />
            </IconButton>
            <IconButton style={floatingButtonStyle} onClick={() => setAdjacentGroup("previous")}>
              <NavigateBeforeIcon fontSize="large" />
            </IconButton>
            <IconButton style={floatingButtonStyle} onClick={() => setAdjacentGroup("next")}>
              <NavigateNextIcon fontSize="large" />
            </IconButton>
            <CommentIconButton />
          </ButtonGroup>
        </div>
      </Box>
    </>
  );
};

const floatingButtonStyle = {
  display: "flex",
  alignItems: "center",
  padding: "12px",
  fontSize: "small",
};

export default FloatingButtonGroup;
