"use client";

import AuthModal from '@/components/AuthModal';
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
      <AuthModal />
    </>
  );
}
 
export default ModalClient;