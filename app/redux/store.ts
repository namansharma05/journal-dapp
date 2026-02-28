import { configureStore, Store } from "@reduxjs/toolkit";
import  openNewEntryModalSlice from "./slices/openNewEntryModal";
import journalSlice from "./slices/journal";

export const store = configureStore({
    reducer: {
        openNewEntryModal: openNewEntryModalSlice,
        journal: journalSlice,
    },
});

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch