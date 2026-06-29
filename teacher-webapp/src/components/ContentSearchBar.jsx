import React from "react";
import { Box, Paper, InputBase, Chip } from "@mui/material";
import {
  Search as SearchIcon,
  MusicNote as MusicNoteIcon,
  MenuBook as MenuBookIcon,
} from "@mui/icons-material";

/**
 * ContentSearchBar - search input and filter chips for content browsing
 */
const ContentSearchBar = ({
  searchQuery,
  onSearchChange,
  availableTabs,
  activeTab,
  onTabChange,
}) => {
  return (
    <>
      {/* Search */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Paper
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1.5,
            py: 0.75,
            borderRadius: 3,
            backgroundColor: "grey.50",
          }}
        >
          <SearchIcon sx={{ color: "text.disabled", mr: 1, fontSize: 20 }} />
          <InputBase
            placeholder="Search songs, stories..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ flex: 1, fontSize: "0.875rem" }}
          />
        </Paper>
      </Box>

      {/* Filter tabs */}
      <Box sx={{ px: 2, pb: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
        {availableTabs.map((tab) => (
          <Chip
            key={tab}
            label={tab.charAt(0).toUpperCase() + tab.slice(1)}
            onClick={() => onTabChange(tab)}
            variant={activeTab === tab ? "filled" : "outlined"}
            color={activeTab === tab ? "primary" : "default"}
            icon={
              tab === "song" ? (
                <MusicNoteIcon style={{ fontSize: 14 }} />
              ) : tab === "story" ? (
                <MenuBookIcon style={{ fontSize: 14 }} />
              ) : undefined
            }
            sx={{ borderRadius: 3, fontWeight: activeTab === tab ? 600 : 400 }}
          />
        ))}
      </Box>
    </>
  );
};

export default ContentSearchBar;
