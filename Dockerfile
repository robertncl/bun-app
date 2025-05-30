FROM alpine:3.19

# Environment variables
ENV RUNNER_VERSION=2.314.1
ENV RUNNER_ARCH=x64
ENV RUNNER_CONTAINER_HOOKS_VERSION=0.5.1
ENV DOTNET_VERSION=8.0

# Install .NET Core dependencies and basic requirements
RUN apk add --no-cache \
    icu-libs \
    krb5-libs \
    libgcc \
    libintl \
    libssl3 \
    libstdc++ \
    zlib \
    curl \
    tar \
    jq \
    git \
    nodejs \
    npm \
    docker \
    docker-cli-compose \
    sudo \
    bash \
    unzip \
    wget \
    && rm -rf /var/cache/apk/*

# Install .NET Runtime using official script
RUN wget https://dot.net/v1/dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --channel ${DOTNET_VERSION} --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && rm dotnet-install.sh

# Create a runner user
RUN adduser -D -h /home/runner runner \
    && addgroup runner docker

# Install GitHub Runner
WORKDIR /home/runner
RUN curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz \
    && tar xzf runner.tar.gz \
    && rm runner.tar.gz \
    && ./bin/installdependencies.sh \
    && chown -R runner:runner /home/runner

# Install container hooks
RUN mkdir -p /home/runner/hooks \
    && curl -f -L -o /home/runner/hooks/runner-container-hooks.zip https://github.com/actions/runner-container-hooks/releases/download/v${RUNNER_CONTAINER_HOOKS_VERSION}/runner-container-hooks-${RUNNER_CONTAINER_HOOKS_VERSION}.zip \
    && unzip /home/runner/hooks/runner-container-hooks.zip -d /home/runner/hooks \
    && rm /home/runner/hooks/runner-container-hooks.zip \
    && chown -R runner:runner /home/runner/hooks

# Copy startup script
COPY --chown=runner:runner start.sh /home/runner/start.sh
RUN chmod +x /home/runner/start.sh

USER runner
ENTRYPOINT ["/home/runner/start.sh"]