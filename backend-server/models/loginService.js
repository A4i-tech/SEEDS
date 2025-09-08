const STATUS_OK = 200;

module.exports = {
    loginService(req, res) {
        const authType = process.env.AUTH_TYPE || 'native';
        if (authType === 'firebase') {
            return res.status(STATUS_OK).json({ service: 'firebase' });
        } else {
            return res.status(STATUS_OK).json({ service: 'native' });
        }
    }
};