
export const handler = async () => {
  return {
    statusCode: 410,
    body: JSON.stringify({ message: "This endpoint is deprecated. DB connection is now direct from frontend." })
  };
};
