import { configureStore, Store } from "@reduxjs/toolkit";
import  openNewEntryModalSlice from "./slices/openNewEntryModal";
export const store = configureStore({
    reducer: {
        openNewEntryModal: openNewEntryModalSlice,
    },
});

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch