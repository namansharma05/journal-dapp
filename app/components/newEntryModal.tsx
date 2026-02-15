import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { closeNewEntryModal } from "../redux/slices/openNewEntryModal";

export function NewEntryModal() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const dispatch = useAppDispatch();
  const showEntryModal = useAppSelector((state) => state.openNewEntryModal);

  const handleCreateJournal = async () => {
    const port = process.env.NEXT_PUBLIC_PORT || 3001;
    const response = await fetch(
      `http://localhost:${port}/create/journal-entry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title,
          message: message,
        }),
      }
    );
    const data = await response.json();
    console.log(data);
    setTitle("");
    setMessage("");
    dispatch(closeNewEntryModal());
  };

  return (
    <>
      {showEntryModal ? (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
          <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm">New Entry</div>
              <div
                onClick={() => dispatch(closeNewEntryModal())}
                className="text-sm cursor-pointer"
              >
                x
              </div>
            </div>
            <form>
              <div className="mb-4">
                <label htmlFor="title" className="block text-sm mb-2">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  required
                  onChange={(e) => setTitle(e.target.value)}
                  value={title}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="mb-4">
                <label htmlFor="message" className="block text-sm mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  onChange={(e) => setMessage(e.target.value)}
                  value={message}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => dispatch(closeNewEntryModal())}
                  className="px-4 py-2 mr-2 text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateJournal}
                  disabled={title.length === 0 || message.length === 0}
                  className={
                    title.length > 0 && message.length > 0
                      ? "px-4 py-2 bg-orange-400 text-white rounded-md hover:bg-orange-300 hover:duration-50"
                      : "px-4 py-2 bg-orange-300 text-white rounded-md cursor-not-allowed"
                  }
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
