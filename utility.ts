import { createHmac } from 'crypto';

export abstract class Utils {
    static validator(predicate: Function) {
        return function (value) {
            return predicate(value);
        }
    }

    static isValidPassword(password: string) {
        const re = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&<>=_\{\}\[\]|\\\/])[A-Za-z\d@$!%*#?&<>=_\{\}\[\]|\\\/]{8,}$/;
        return re.test(password);
    }

    static isValidEmail(email: string): boolean {
        const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }

    static hash(plain: string, method: string = 'sha256') {
        const salt = "as98rt39ui34qw12";
        return createHmac('sha256', salt).update(plain).digest('hex');
    }

}
