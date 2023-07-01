"use client";

import Modal from "@/components/Modal";
import { useEffect, useState } from "react";

const ModalClient = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <Modal />
    </>
  );
}
 
export default ModalClient;