import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { clearEditingEntry, setEditingEntry } from "../redux/slices/journal";

interface JournalEntry {
  owner: string;
  title: string;
  message: string;
}

export function EditEntry({
  entry,
  index,
}: {
  entry: JournalEntry;
  index: number;
}) {
  const dispatch = useAppDispatch();
  return (
    <div>
      <button
        onClick={() => dispatch(setEditingEntry({ ...entry, index }))}
        className="px-4 py-2 rounded-xl cursor-pointer border text-sm hover:bg-gray-100 transition"
      >
        Edit
      </button>
    </div>
  );
}

export function EditEntryModal() {
  const editingEntry = useAppSelector((state) => state.journal.editingEntry);
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (editingEntry) {
      setTitle(editingEntry.title);
      setMessage(editingEntry.message);
    }
  }, [editingEntry]);

  if (!editingEntry) return null;

  const handleClose = () => {
    dispatch(clearEditingEntry());
  };

  const handleSave = async () => {
    // Logic for updating the entry will go here later
    console.log("Saving entry:", { index: editingEntry.index, title, message });
    dispatch(clearEditingEntry());
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[90%] md:w-[60%] lg:w-[40%] bg-white p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            Edit Entry #{editingEntry.index}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-black transition"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-orange-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-orange-400 outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={handleClose}
            className="px-6 py-2 rounded-xl border font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition shadow-lg shadow-orange-200"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
