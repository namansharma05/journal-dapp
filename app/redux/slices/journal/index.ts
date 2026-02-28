import { createSlice } from "@reduxjs/toolkit";

export const journalSlice = createSlice({
    name: "journal",
    initialState: {
        refreshTrigger: 0,
    },
    reducers: {
        incrementRefreshTrigger: (state) => {
            state.refreshTrigger += 1;
        },
    }
});

export const { incrementRefreshTrigger } = journalSlice.actions;
export default journalSlice.reducer;
