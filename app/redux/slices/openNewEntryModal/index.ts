import { createSlice } from "@reduxjs/toolkit";

export const openNewEntryModalSlice = createSlice({
    initialState: false,
    name: "openNewEntryModal",
    reducers: {
        openNewEntryModal: (state) => {
            return true;
        },
        closeNewEntryModal: (state) => {
            return false;
        }
    }
});

export const { openNewEntryModal, closeNewEntryModal } = openNewEntryModalSlice.actions;
export default openNewEntryModalSlice.reducer;