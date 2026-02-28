import { createSlice } from "@reduxjs/toolkit";

export const journalSlice = createSlice({
    name: "journal",
    initialState: {
        refreshTrigger: 0,
        editingEntry: null as { owner: string; title: string; message: string; index: number; id: number; address: string } | null,
    },
    reducers: {
        incrementRefreshTrigger: (state) => {
            state.refreshTrigger += 1;
        },
        setEditingEntry: (state, action) => {
            state.editingEntry = action.payload;
        },
        clearEditingEntry: (state) => {
            state.editingEntry = null;
        }
    }
});

export const { incrementRefreshTrigger, setEditingEntry, clearEditingEntry } = journalSlice.actions;
export default journalSlice.reducer;
