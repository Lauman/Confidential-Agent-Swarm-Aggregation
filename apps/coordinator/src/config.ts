// Coordinator configuration
export const config = {
  port: parseInt(process.env.PORT || '3001'),
  quorum: parseInt(process.env.QUORUM || '3'),
  creEndpoint: process.env.CRE_ENDPOINT || 'http://localhost:3002'
};