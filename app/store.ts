import { configureStore } from '@reduxjs/toolkit'
import journalReducer from './features/journal/journalSlice'

export const store = configureStore({
  reducer: {
    journal: journalReducer,
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppStore = typeof store