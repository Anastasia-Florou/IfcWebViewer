import React, { ReactElement } from "react";
import { Fab, Box, SxProps, Theme, Tooltip } from "@mui/material";

export interface IconButtonConfig {
  icon: ReactElement;
  color?: "inherit" | "primary" | "secondary" | "success" | "error" | "info" | "warning";
  ariaLabel: string;
  onClick: () => void;
  size?: "small" | "medium" | "large";
  tooltip?: string;
  sx?: SxProps<Theme>;
  disabled?: boolean;
}

interface FloatingIconButtonsProps {
  buttons: IconButtonConfig[];
  containerSx?: SxProps<Theme>;
}

const IconPanel: React.FC<FloatingIconButtonsProps> = ({ buttons, containerSx }) => {
  const defaultButtonSx: SxProps<Theme> = { mb: 1 };

  return (
    <Box
      component="div"
      sx={{
        display: "flex",
        flexDirection: "column",
        ...containerSx,
      }}
    >
      {buttons.map((button, index) => (
        <Tooltip
          key={index}
          placement="left"
          title={button.tooltip ?? button.ariaLabel}
        >
          <span> {/* Add a span wrapper to resolve the tooltip issue with disabled buttons */}
            <Fab
              disabled={button.disabled ?? false}
              color={button.color || "primary"}
              aria-label={button.ariaLabel}
              onClick={button.onClick}
              size={button.size || "medium"}
              sx={{ ...defaultButtonSx, ...button.sx }}
            >
              {button.icon}
            </Fab>
          </span>
        </Tooltip>
      ))}
    </Box>
  );
};

export default IconPanel;
