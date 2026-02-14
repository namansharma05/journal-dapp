import { useState } from "react";

export function Navbar() {
  const [newEntryModalOpen, setNewEntryModalOpen] = useState(false);
  // const handleCreateJournal = async () => {
  //   const response = await fetch("http://localhost:3000/create/journal-entry", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       title: "My Journal",
  //       message: "Hello World!",
  //     }),
  //   });
  //   const data = await response.json();
  //   console.log(data);
  // }

  return (
    <div className="px-[10%] py-[3%] md:px-[11%] md:py-[3%] lg:px-[12%] lg:py-[2%] border-b mb-5">
      <div className="flex justify-between items-center">
        <div className="">My Journal</div>
        <div
          onClick={() => setNewEntryModalOpen(true)}
          className="bg-orange-400 rounded-lg px-5 py-2"
        >
          + New Entry
        </div>
      </div>
    </div>
  );
}
