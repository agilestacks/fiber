FROM node:12.18-alpine3.12

LABEL maintainer="Arkadi Shishlov <arkadi@agilestacks.com>"

RUN mkdir /app
WORKDIR /app

ADD https://storage.googleapis.com/kubernetes-release/release/v1.19.3/bin/linux/amd64/kubectl /bin/
RUN chmod go+r,+x /bin/kubectl

ENV NODE_ENV $NODE_ENV
COPY package.json package-lock.json LICENSE README.md /app/
RUN npm -q install --only=prod && npm -q cache clean --force
ADD https://raw.githubusercontent.com/agilestacks/korral/master/install/kubernetes.yaml /app/korral.yaml
COPY fiber /app/
COPY src/ /app/src/

ENTRYPOINT [ "/app/fiber" ]
CMD []
